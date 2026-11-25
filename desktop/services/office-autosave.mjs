import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const choices = ['copy', 'overwrite', 'reload'];
const conflictError = () => Object.assign(new Error('原文件已被修改'), { code: 'OFFICE_CONFLICT' });

async function fingerprint(file) {
  let handle;
  try {
    handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw Error('Office 保存目标必须是普通文件');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat({ bigint: true });
    const current = await fs.lstat(file, { bigint: true });
    const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
    if (identity(before) !== identity(after) || identity(after) !== identity(current)) throw conflictError();
    return { identity: identity(after), mtime: Number(after.mtimeNs) / 1e6, mode: Number(after.mode), sha256: hash.digest('hex') };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  } finally {
    await handle?.close();
  }
}

const same = (a, b) => a?.identity === b?.identity && a?.sha256 === b?.sha256;

async function atomicWrite(io, file, bytes, { mode = 0o600, check, exclusive } = {}) {
  const temp = path.join(path.dirname(file), '.office-' + randomUUID() + '.tmp');
  try {
    const handle = await io.open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.chmod(mode & 0o777);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await check?.();
    if (exclusive) await io.link(temp, file);
    else await io.rename(temp, file);
  } finally {
    await io.rm(temp, { force: true }).catch(() => {});
  }
}

/**
 * The main-side session adapter serializes with save({ reason, mode: 'snapshot' })
 * and returns Uint8Array without changing the source or clearing editor dirty state.
 * reload({ file, bytes? }) loads the source or restores a draft in memory.
 * versions.record atomically upserts by id, using mergeKey for an auto window.
 * Revision mismatches from versions.record use code OFFICE_CONFLICT.
 * versions.finalize seals that window. versions.head reports a library revision
 * where a document can also be modified through the independent Office window.
 */
export async function createAutosave(session, {
  file, userData, versions, codec, reload, journal, library = false, idleMs = 2_000, maxMs = 30_000,
  recoveryMs = 30_000, autoVersionMs = 600_000,
  clock = { now: Date.now, setTimeout, clearTimeout }, io = fs,
} = {}) {
  file = library ? undefined : path.resolve(file);
  const sessionId = randomUUID();
  const recoveryDir = path.join(userData, 'office', 'recovery');
  const recoveryFile = path.join(recoveryDir, sha256(library ? 'library:' + session.docId : file) + '.snapshot');
  let baseline = library ? await versions.fingerprint(session.docId) : await fingerprint(file);
  const currentFingerprint = () => library ? versions.fingerprint(session.docId) : fingerprint(file);
  let revision = await versions.head?.(session.docId);
  let sequence = 0, persisted = 0, dirtySince, lastDirty, lastRecovery;
  let composing = false, dragging = false, closed = false, paused = false;
  let interactionSince = 0, staleLogged = false;
  let conflict, recovery, saveTimer, recoveryTimer, autoWindow, pendingVersion;
  let tail = Promise.resolve();
  let state = { status: 'idle' };
  const events = new EventEmitter();

  function publish(status, detail = {}) {
    const time = detail.at === undefined ? undefined : new Date(detail.at).toLocaleTimeString('zh-CN', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const label = { saving: '保存中…', saved: '已保存 · ' + time, unsaved: '未保存（重试）' }[status];
    state = { status, label, ...detail };
    events.emit(status, state);
  }

  function serialize(fn) {
    const next = tail.then(fn);
    tail = next.catch(() => {});
    return next;
  }

  // [V100-5] 控制器侧兜底：渲染层没发复位时，20 秒后把 ime/drag 视为结束，
  // 防止自动保存永久暂停。正在组合/拖动且不足 20 秒时行为不变。
  const interactionStale = () => (composing || dragging) && interactionSince > 0 && clock.now() - interactionSince > 20_000;
  function staleNotice() {
    if (process.env.QUANK_SELFTEST === '1' && !staleLogged) {
      console.error('[office-autosave] interaction-stale');
      staleLogged = true;
    }
  }
  const busy = () => {
    if (!composing && !dragging) return false;
    if (interactionStale()) { staleNotice(); return false; }
    return true;
  };
  const dirty = () => sequence !== persisted;
  const outstanding = () => dirty() || Boolean(pendingVersion || conflict);

  function schedule() {
    clock.clearTimeout(saveTimer);
    clock.clearTimeout(recoveryTimer);
    if (closed || recovery || !outstanding()) return;
    if (!paused && !conflict) {
      if (busy()) {
        // [V100-5] 交互仍在进行：挂一个 20 秒过期唤醒，到点重新评估；不到点不保存。
        saveTimer = clock.setTimeout(() => serialize(() => schedule()),
          Math.max(1, interactionSince + 20_000 + 1 - clock.now()));
      } else {
        const due = () => Math.min(lastDirty + idleMs, dirtySince + maxMs);
        saveTimer = clock.setTimeout(() => serialize(() => {
          if (paused || clock.now() < due()) return;
          return saveNow('auto');
        }), Math.max(0, due() - clock.now()));
      }
    }
    if (dirty()) {
      recoveryTimer = clock.setTimeout(() => serialize(writeRecovery),
        Math.max(0, lastRecovery + recoveryMs - clock.now()));
    }
  }

  function markDirty() {
    if (closed || session.readOnly) return;
    lastDirty = clock.now();
    if (!dirty()) dirtySince = lastRecovery = lastDirty;
    sequence++;
    schedule();
  }

  async function snapshot(reason) {
    const bytes = await session.save({ reason, mode: 'snapshot' });
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw Error('Office 未返回有效的保存内容');
    return Buffer.from(bytes);
  }

  async function writeRecovery() {
    if (closed || busy() || recovery || !dirty()) return;
    try {
      const bytes = await snapshot('auto');
      const text = JSON.stringify({ at: clock.now(), sha256: sha256(bytes), bytes: bytes.toString('base64') });
      await io.mkdir(recoveryDir, { recursive: true, mode: 0o700 });
      await atomicWrite(io, recoveryFile, codec ? codec.encode(text) : Buffer.from(text));
    } catch (error) {
      events.emit('recovery-error', error);
    } finally {
      lastRecovery = clock.now();
      schedule();
    }
  }

  try {
    const raw = await fs.readFile(recoveryFile);
    const draft = JSON.parse(codec ? codec.decode(raw) : raw.toString('utf8'));
    const bytes = Buffer.from(draft.bytes, 'base64');
    if (sha256(bytes) !== draft.sha256) throw Error('Office 恢复快照校验失败');
    if (draft.at > (baseline?.mtime ?? -Infinity) && draft.sha256 !== baseline?.sha256) {
      recovery = { at: draft.at, bytes };
    } else {
      await io.rm(recoveryFile, { force: true });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  async function finishVersion() {
    if (!pendingVersion) return undefined;
    const version = await versions.record(pendingVersion);
    if (version?.revision !== undefined && !pendingVersion.isCopy) revision = versions.head ? version.revision : undefined;
    await journal?.done(pendingVersion.id);
    pendingVersion = undefined;
    return version;
  }

  async function finalizeWindow() {
    if (!autoWindow) return;
    await versions.finalize?.({ docId: session.docId, mergeKey: autoWindow.key });
    autoWindow = undefined;
  }

  async function clearRecovery() {
    try {
      await io.rm(recoveryFile, { force: true });
    } catch (error) {
      events.emit('recovery-error', error);
    }
  }

  async function saveNow(reason, resolution) {
    if (closed || session.readOnly) return { ok: true };
    if (busy() || recovery) return { ok: false, state };
    if (conflict && !resolution) return { ok: false, state };
    if (reason === 'auto' && !outstanding()) return { ok: true };

    publish('saving');
    const target = resolution?.choice === 'copy' && !library ? path.resolve(resolution.file) : file;
    const isCopy = resolution?.choice === 'copy';
    let job, version, error;
    const resumedVersion = !library && Boolean(pendingVersion);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (pendingVersion && resolution) pendingVersion = undefined;
        if (pendingVersion && !library) version = await finishVersion();
        if (job?.committed || (resumedVersion && !resolution && !dirty() && reason === 'auto')) break;
        const check = async () => {
          const current = await currentFingerprint();
          const head = await versions.head?.(session.docId);
          if (isCopy) return;
          if (!same(current, resolution ? resolution.baseline : baseline) ||
              head !== (resolution ? resolution.revision : revision)) throw conflictError();
        };
        await check();
        if (!job) {
          const generation = sequence;
          const bytes = await snapshot(reason);
          job = { generation, bytes, at: clock.now(), id: randomUUID() };
        }
        if (busy()) {
          if (dirty()) publish('unsaved', { error: Error('输入完成后可保存') });
          schedule();
          return { ok: false, state };
        }
        if (reason === 'auto' && autoWindow && (autoWindow.file !== target || job.at - autoWindow.at >= autoVersionMs)) {
          await finalizeWindow();
        }
        if (reason === 'auto') autoWindow ??= { at: job.at, key: sessionId + ':' + job.id, file: target };
        const receipt = {
          id: job.id, docId: session.docId, file: target, isCopy,
          reason, at: job.at, size: job.bytes.length, bytes: job.bytes, sha256: sha256(job.bytes),
          expectedRevision: resolution?.revision ?? revision, mergeKey: reason === 'auto' ? autoWindow.key : undefined,
        };
        await journal?.intent(receipt);
        if (!library) await atomicWrite(io, target, job.bytes, {
          mode: target === file ? (baseline?.mode ?? 0o600) : 0o600,
          exclusive: isCopy,
          check: async () => {
            await check();
            if (busy()) throw Error('输入完成后可保存');
          },
        });
        job.committed = !library;
        pendingVersion = receipt;
        if (library) {
          version = await finishVersion();
          if (isCopy) {
            await reload();
            baseline = await currentFingerprint();
            revision = await versions.head?.(session.docId);
            autoWindow = undefined;
          }
        }
        persisted = job.generation;
        if (!isCopy) {
          baseline = await currentFingerprint();
          if (baseline?.sha256 !== receipt.sha256) {
            baseline = { identity: 'replaced during save' };
          }
        }
        if (!library) version = await finishVersion();
        break;
      } catch (failure) {
        error = failure;
        if (failure.code === 'OFFICE_CONFLICT') {
          if (library && pendingVersion) {
            await journal?.done(pendingVersion.id).catch(() => {});
            pendingVersion = undefined;
          }
          if (pendingVersion && !dirty()) markDirty();
          conflict = { reason };
          publish('conflict', { choices, defaultChoice: 'copy' });
          schedule();
          return { ok: false, state };
        }
        if (attempt === 2) {
          paused = true;
          publish('unsaved', { error });
          schedule();
          return { ok: false, state };
        }
      }
    }
    conflict = undefined;
    paused = false;
    if (!dirty()) await clearRecovery();
    else dirtySince = lastDirty;
    publish('saved', { at: job?.at ?? clock.now(), version, file: target });
    schedule();
    return { ok: true, state };
  }

  function save(reason = 'manual') {
    if (!['auto', 'manual', 'ai'].includes(reason)) throw Error('Office 保存原因无效');
    return serialize(() => saveNow(reason));
  }

  const subscriptions = [['dirty', markDirty], ['saved', () => {
    // The engine receipt is informational. Only a completed commit marks this controller saved.
  }]].map(([event, fn]) => {
    const unsubscribe = session.on(event, fn);
    return typeof unsubscribe === 'function' ? unsubscribe : () => session.off?.(event, fn);
  });

  return {
    on(event, fn) {
      events.on(event, fn);
      return () => events.off(event, fn);
    },
    get state() { return state; },
    abandon() {
      closed = true;
      schedule();
      for (const unsubscribe of subscriptions) unsubscribe();
      events.removeAllListeners();
    },
    get recovery() {
      return recovery && { at: recovery.at, message: '恢复未保存的修改', choices: ['restore', 'discard'] };
    },
    setInteraction({ ime = composing, drag = dragging }) {
      composing = ime;
      dragging = drag;
      if (ime || drag) interactionSince = clock.now();
      else { interactionSince = 0; staleLogged = false; }
      schedule();
    },
    save,
    retry: () => save('auto'),
    refresh() {
      return serialize(async () => {
        if (closed || outstanding() || busy() || recovery) return false;
        const current = await currentFingerprint();
        const head = await versions.head?.(session.docId);
        if (!same(current, baseline) || head !== revision) {
          await reload({file});
          baseline = current;
          revision = head;
        }
        return true;
      });
    },
    resolveConflict(choice, copyFile) {
      return serialize(async () => {
        if (!conflict || !choices.includes(choice) || busy()) return { ok: false, state };
        const current = await currentFingerprint();
        const head = await versions.head?.(session.docId);
        if (choice === 'copy' && !library && (!copyFile || path.resolve(copyFile) === file)) {
          throw Error('请为副本选择一个新文件路径');
        }
        if (choice === 'reload') {
          await finalizeWindow();
          const generation = sequence;
          await reload({ file });
          baseline = current;
          revision = head;
          persisted = generation;
          pendingVersion = conflict = undefined;
          paused = false;
          if (!dirty()) await clearRecovery();
          publish('saved', { at: clock.now() });
          schedule();
          return { ok: true, state };
        }
        return saveNow(conflict.reason, { choice, file: copyFile, baseline: current, revision: head });
      });
    },
    resolveRecovery(choice) {
      return serialize(async () => {
        if (!recovery || !['restore', 'discard'].includes(choice)) return false;
        if (choice === 'restore') {
          const generation = sequence;
          await reload({ file, bytes: recovery.bytes });
          if (generation === sequence) markDirty();
        } else await clearRecovery();
        recovery = undefined;
        schedule();
        return true;
      });
    },
    prepareClose(prompt) {
      return serialize(async () => {
        if (closed) return { valid: () => true, commit: () => {} };
        if (outstanding() && !conflict) await saveNow('auto');
        let discard = false;
        while (recovery || outstanding() || busy()) {
          const choice = await prompt({
            message: '有未保存修改', choices: ['save', 'discard', 'cancel'], state,
          });
          if (choice === 'discard') {
            discard = true;
            break;
          }
          if (choice !== 'save' || conflict || recovery || busy()) return null;
          await saveNow(dirty() ? 'manual' : 'auto');
        }
        const generation = sequence;
        try {
          await finalizeWindow();
        } catch (error) {
          publish('unsaved', { error });
          return null;
        }
        return {
          valid: () => closed || (sequence === generation &&
            (discard || (!recovery && !outstanding() && !busy()))),
          commit() {
            if (closed) return;
            closed = true;
            schedule();
            for (const unsubscribe of subscriptions) unsubscribe();
            return clearRecovery();
          },
        };
      });
    },
    async requestClose(prompt) {
      const prepared = await this.prepareClose(prompt);
      if (!prepared?.valid()) return false;
      await prepared.commit();
      return true;
    },
  };
}

/** Main-process lifecycle entry point. The workbench supplies its in-tab card. */
export function registerOfficeAutosave({ promptClose, defaults }) {
  const tabs = new Map();
  return {
    async open(session, options) {
      if (tabs.has(session.docId)) throw Error('Office 已有保存会话');
      const opening = createAutosave(session, { ...defaults, ...options });
      tabs.set(session.docId, opening);
      try {
        return await opening;
      } catch (error) {
        tabs.delete(session.docId);
        throw error;
      }
    },
    async close(docId) {
      const opening = tabs.get(docId);
      if (!opening) return true;
      const controller = await opening;
      if (!(await controller.requestClose(card => promptClose(docId, card)))) return false;
      if (tabs.get(docId) === opening) tabs.delete(docId);
      return true;
    },
    abandon() {
      for (const opening of tabs.values()) void opening.then(controller => controller.abandon()).catch(() => {});
      tabs.clear();
    },
    async beforeQuit() {
      const prepared = [];
      for (const [docId, opening] of tabs) {
        const tab = await opening;
        const decision = await tab.prepareClose(card => promptClose(docId, card));
        if (!decision) return false;
        prepared.push({ docId, opening, decision });
      }
      if (prepared.some(({ docId, opening, decision }) =>
        tabs.get(docId) !== opening || !decision.valid())) return false;
      await Promise.all(prepared.map(({ docId, decision }) => {
        tabs.delete(docId);
        return decision.commit();
      }));
      return true;
    },
  };
}

export function createOfficeCommitJournal({userData, versions, codec, io = fs}) {
  const directory = path.join(userData, 'office', 'commits');
  const fileFor = id => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Office 提交标识无效');
    return path.join(directory, id + '.json');
  };
  const sync = async () => {
    const directoryHandle = await io.open(directory, 'r');
    try { await directoryHandle.sync(); }
    finally { await directoryHandle.close(); }
  };
  return {
    async intent({bytes, ...receipt}) {
      await io.mkdir(directory, {recursive:true, mode:0o700});
      const record = JSON.stringify({state:'intent', receipt, ...(!receipt.file && {bytes:bytes.toString('base64')})});
      await atomicWrite(io, fileFor(receipt.id), codec ? codec.encode(record) : Buffer.from(record));
      await sync();
    },
    async done(id) {
      const file = fileFor(id);
      const record = JSON.stringify({state:'done', id});
      await atomicWrite(io, file, codec ? codec.encode(record) : Buffer.from(record));
      await sync();
      await io.rm(file, {force:true});
    },
    async recover({allowPath = () => false} = {}) {
      await io.mkdir(directory, {recursive:true, mode:0o700});
      const result = {completed:0, deferred:0};
      for (const name of await io.readdir(directory)) {
        if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
        const id = name.slice(0,-5);
        try {
          const raw = await io.readFile(fileFor(id));
          const data = JSON.parse(codec ? codec.decode(raw) : raw.toString('utf8'));
          if (data.state === 'done') { await io.rm(fileFor(id), {force:true}); continue; }
          const receipt = data.receipt;
          if (data.state !== 'intent' || receipt.id !== id) throw Error('Office 提交日志无效');
          if (receipt.file && !await allowPath(receipt.file)) throw Error('Office 提交路径未授权');
          let bytes;
          if (receipt.file) {
            const handle = await io.open(receipt.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
            try {
              const stat = await handle.stat();
              if (!stat.isFile() || stat.size !== receipt.size) throw Error('Office 提交目标已变化');
              bytes = await handle.readFile();
            } finally { await handle.close(); }
          } else bytes = Buffer.from(data.bytes, 'base64');
          if (bytes.length !== receipt.size || sha256(bytes) !== receipt.sha256) throw Error('Office 提交内容已变化');
          await versions.record({...receipt, bytes});
          await this.done(id);
          result.completed++;
        } catch {
          result.deferred++;
        }
      }
      return result;
    },
  };
}

export async function migrateOfficeDrafts(userData, codec, io = fs) {
  const groups = {recovery: /^[a-f0-9]{64}\.snapshot$/, commits: /^[a-f0-9-]{36}\.json$/};
  for (const [folder, names] of Object.entries(groups)) {
    const dir = path.join(userData, 'office', folder);
    let entries;
    try { entries = await io.readdir(dir); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const name of entries) {
      if (!names.test(name)) continue;
      const file = path.join(dir,name);
      await atomicWrite(io, file, codec.encode(codec.decode(await io.readFile(file))));
    }
  }
}
