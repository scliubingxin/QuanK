import { execFile, spawn } from 'node:child_process';
import { constants, createWriteStream } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readlink, realpath, rename, rm, rmdir, symlink, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { ignoreCodingFiles, localEntry } from '../services/coding-context.mjs';

const exec = promisify(execFile);
const DIFF_LIMIT = 200 * 1024;
const note = '\n… diff 超过 200 KB，已截断。\n';
const cancelled = message => Object.assign(new Error(message), { kind: 'cancelled' });
const baseName = command => String(command || '').replaceAll('\\', '/').split('/').at(-1).toLowerCase();

export function forbiddenCodingPermission(info) {
  const call = info.toolCall || {};
  const args = [info.command, ...(info.args || []), call.title, call.rawInput?.command, call.rawInput?.cmd]
    .filter(Boolean).join(' ');
  const git = /\bgit(?:\.exe)?\b/i;
  // Inspect both direct exec and shell-style commands before applying a remembered permission.
  if (git.test(args) && /\b(?:push|remote|send-pack)\b|\bconfig\b.*(?:remote\.|pushurl|insteadof)/i.test(args)) return true;
  if (baseName(info.command) === 'git' && (info.args || []).some(arg => /^(?:push|send-pack|remote|config)$/.test(arg))) return true;
  const cwd = info.cwd;
  const target = info.path;
  return info.kind === 'write' && (/(?:^|[\\/])\.git(?:[\\/]|$)/i.test(target || '') ||
    /(?:^|[\\/])\.quank[\\/]context(?:[\\/]|$)/i.test(target || '') ||
    (cwd && target && path.isAbsolute(target) && /^(?:\.git|\.quank\/context)(?:\/|$)/.test(path.relative(cwd, target))));
}

export function parseCodingReport(markdown) {
  for (const match of markdown.matchAll(/^[ \t]*```json[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gmi)) {
    try {
      const { tests, backtest } = JSON.parse(match[1]);
      const result = {};
      if (typeof tests?.ok === 'boolean') result.tests = { ok: tests.ok, summary: String(tests.summary ?? '').slice(0, 4000) };
      if (backtest?.before && backtest?.after) {
        const metrics = side => ({
          ...Object.fromEntries(['returnPct', 'maxDrawdownPct', 'winRatePct', 'trades'].map(key => [key, typeof side[key] === 'number' ? side[key] : null])),
          hitRates: Object.fromEntries(Object.entries(side.hitRates || {}).filter(([, value]) => typeof value === 'number').slice(0, 40)),
        });
        result.backtest = { before: metrics(backtest.before), after: metrics(backtest.after) };
      }
      if (Object.keys(result).length) return result;
    } catch { /* A report may contain other JSON examples. */ }
  }
  return {};
}

export function createCodingGit(project) {
  const git = async (...args) => (await exec('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {
    cwd: project, maxBuffer: 16 * 1024 * 1024, timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })).stdout;
  const commit = message => git('-c', 'user.name=QuankSight', '-c', 'user.email=quank@localhost', 'commit', '-m', message);
  async function stage() {
    await assertSnapshotUntracked();
    if (await localEntry(path.join(project, '.quank'))) {
      const ignored = await git('check-ignore', '-q', '--', '.quank/').then(() => true, () => false);
      if (!ignored) throw new Error('请先让 Git 忽略策略项目的 .quank/ 目录');
    }
    await git('add', '-A');
    await assertSnapshotUntracked();
  }
  async function assertSnapshotUntracked() {
    if (await git('ls-files', '--', '.quank/')) throw new Error('请先取消 Git 对 .quank/ 的跟踪');
  }
  const branch = async () => (await git('symbolic-ref', '--short', 'HEAD')).trim();
  const status = () => git('status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude,top).quank');
  async function checkBranch(expected) {
    if (await branch() !== expected) throw new Error('当前 Git 分支已变化，请先切回 ' + expected);
  }
  async function assertRoot() {
    const root = (await git('rev-parse', '--show-toplevel').catch(() => '')).trim();
    if (root && await realpath(root) !== project) throw new Error('策略项目必须是 Git 仓库根目录');
    return root;
  }
  async function captureWorkspace() {
    const paths = ['--', '.', ':(exclude,top).quank'];
    const [tracked, untracked, staged, head, index] = await Promise.all([
      git('diff', '--name-only', '--no-renames', '-z', ...paths),
      git('ls-files', '--others', '--exclude-standard', '-z', ...paths),
      git('diff', '--cached', '--name-only', '--no-renames', '-z', ...paths),
      git('rev-parse', 'HEAD'),
      git('write-tree'),
    ]);
    const entries = [];
    for (const name of new Set((tracked + untracked + staged).split('\0').filter(Boolean))) {
      const file = path.join(project, name);
      const parent = path.dirname(file);
      const info = await realpath(parent).catch(error => {
        if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
        throw error;
      }) === parent ? await lstat(file).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      }) : null;
      if (info?.isSymbolicLink()) entries.push({name, link: await readlink(file)});
      else if (info?.isFile()) entries.push({name, mode: info.mode & 0o7777,
        blob: (await git('hash-object', '-w', '--no-filters', '--', name)).trim()});
      else if (!info || info.isDirectory()) entries.push({name});
      else throw new Error('无法记录工作区文件：' + name);
    }
    return {head: head.trim(), index: index.trim(), entries};
  }
  async function restoreBlob(file, blob, mode) {
    const tempDir = await mkdtemp(path.join(path.dirname(file), '.quank-restore-'));
    const temp = path.join(tempDir, 'file');
    try {
      const child = spawn('git', ['cat-file', 'blob', blob], {cwd: project, stdio: ['ignore', 'pipe', 'ignore']});
      const exit = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve() : reject(new Error('无法读取工作区快照')));
      });
      try { await Promise.all([pipeline(child.stdout, createWriteStream(temp, {mode: 0o600})), exit]); }
      catch (error) { child.kill(); throw error; }
      await chmod(temp, mode);
      await rename(temp, file);
    } finally { await rm(tempDir, {recursive: true, force: true}); }
  }
  async function restoreWorkspace(snapshot) {
    for (const {name, blob, link} of snapshot.entries.filter(entry => !entry.blob && entry.link === undefined)) {
      const file = path.join(project, name);
      if (await realpath(path.dirname(file)).catch(() => null) !== path.dirname(file)) continue;
      const info = await lstat(file).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (info && !info.isDirectory()) await unlink(file);
    }
    for (const {name, mode, blob, link} of snapshot.entries.filter(entry => entry.blob || entry.link !== undefined)) {
      const file = path.join(project, name), parent = path.dirname(file);
      let dir = project;
      for (const part of path.relative(project, parent).split(path.sep).filter(Boolean)) {
        dir = path.join(dir, part);
        await mkdir(dir).catch(error => { if (error.code !== 'EEXIST') throw error; });
        if (!(await lstat(dir)).isDirectory()) throw new Error('工作区路径已变化：' + name);
      }
      const info = await lstat(file).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (info?.isDirectory()) await rmdir(file);
      if (blob) await restoreBlob(file, blob, mode);
      else {
        if (info && !info.isDirectory()) await unlink(file);
        await symlink(link, file);
      }
    }
    await git('read-tree', snapshot.index);
  }
  return {
    async prepare(task, state, permission, check) {
      const root = await assertRoot();
      if (root) await assertSnapshotUntracked();
      const hasHead = root && await git('rev-parse', '--verify', 'HEAD').then(() => true, () => false);
      if (!hasHead) {
        if (!await permission({ kind: 'terminal', summary: '初始化策略项目的 Git 仓库并创建初始提交？' })) throw cancelled('已取消 Git 初始化');
        check();
        if (!root) await git('init');
        await ignoreCodingFiles(project);
        await stage();
        if (await git('diff', '--cached', '--name-only')) await commit('初始化策略项目');
        else await git('-c', 'user.name=QuankSight', '-c', 'user.email=quank@localhost', 'commit', '--allow-empty', '-m', '初始化策略项目');
      }
      task.baseBranch = await branch();
      const dirty = !!await status();
      if (dirty && !await permission({ kind: 'terminal', summary: '工作区有未提交的改动。允许先暂存并记录在迭代分支中，放弃时恢复暂存？' })) {
        throw cancelled('工作区有未提交的改动，已取消');
      }
      check();
      if (dirty) state.workspace = await captureWorkspace();
      const prefix = 'quank/iter-' + new Date(task.createdAt).toISOString().slice(0, 10).replaceAll('-', '') + '-';
      for (let n = 1; ; n++) {
        const name = prefix + n;
        if (await git('branch', '--list', name)) continue;
        await git('switch', '-c', name);
        task.branch = name;
        break;
      }
      if (dirty) {
        if (await localEntry(path.join(project, '.quank'))) await ignoreCodingFiles(project);
        await stage();
        if (await git('diff', '--cached', '--name-only')) {
          await commit('记录迭代前暂存的改动');
          state.stagedCommit = (await git('rev-parse', 'HEAD')).trim();
        }
      }
      if (await ignoreCodingFiles(project)) {
        await git('add', '--', '.gitignore');
        await commit('忽略 QuankSight 本地迭代文件');
      }
      state.iterationBase = (await git('rev-parse', 'HEAD')).trim();
    },
    async hasChanges(task, state) {
      await checkBranch(task.branch);
      return !!await status() || (await git('rev-parse', 'HEAD')).trim() !== state.iterationBase;
    },
    async result(task, redact) {
      await checkBranch(task.branch);
      await assertSnapshotUntracked();
      if (await git('log', '--format=%H', task.baseBranch + '..HEAD', '--', '.quank/')) {
        throw new Error('迭代提交中含有 .quank 文件，请放弃后重试');
      }
      await ignoreCodingFiles(project);
      if (await status()) {
        await stage();
        if (await git('diff', '--cached', '--name-only')) await commit('保存 QuankSight 迭代改动');
      }
      const range = task.baseBranch + '...HEAD';
      const stats = (await git('diff', '--numstat', '-z', range)).split('\0').filter(Boolean);
      const diffStat = { files: 0, insertions: 0, deletions: 0 };
      for (const match of stats.join('\0').matchAll(/(?:^|\0)(\d+|-)\t(\d+|-)\t/g)) {
        diffStat.files++;
        diffStat.insertions += Number(match[1]) || 0;
        diffStat.deletions += Number(match[2]) || 0;
      }
      let diff;
      try { diff = redact(await git('diff', '--no-ext-diff', '--no-color', range)); }
      catch (error) {
        if (error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw error;
        diff = redact(error.stdout) + note;
      }
      const buffer = Buffer.from(diff);
      if (buffer.length > DIFF_LIMIT) {
        let end = DIFF_LIMIT - Buffer.byteLength(note);
        while ((buffer[end] & 0xc0) === 0x80) end--;
        diff = buffer.subarray(0, end).toString() + note;
      }
      const out = { diffStat, diff };
      const dir = path.join(project, '.quank', 'reports');
      await localEntry(path.dirname(dir));
      await localEntry(dir);
      const reportPath = path.join(dir, task.id + '.md');
      const entry = await localEntry(reportPath);
      if (entry?.isFile()) {
        const handle = await open(reportPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          const opened = await handle.stat();
          if (!opened.isFile() || opened.nlink !== 1) throw new Error('迭代报告必须是普通文件');
          const { buffer: bytes, bytesRead } = await handle.read(Buffer.alloc(256 * 1024));
          Object.assign(out, parseCodingReport(redact(bytes.subarray(0, bytesRead).toString())), { reportPath });
        } finally { await handle.close(); }
      }
      return out;
    },
    async merge(task, state) {
      if (await status()) throw new Error('工作区还有未提交的改动，请先处理');
      if (state.gitMerged) {
        await checkBranch(task.baseBranch);
        await git('merge-base', '--is-ancestor', task.branch, 'HEAD');
        return;
      }
      if (await branch() === task.baseBranch) {
        const alreadyMerged = await git('merge-base', '--is-ancestor', task.branch, 'HEAD').then(() => true, () => false);
        if (alreadyMerged) { state.gitMerged = true; return; }
      }
      await checkBranch(task.branch);
      await git('switch', task.baseBranch);
      try { await git('merge', '--no-ff', '--no-edit', task.branch); }
      catch (error) {
        if (await git('rev-parse', '--verify', 'MERGE_HEAD').catch(() => '')) await git('merge', '--abort');
        await git('switch', task.branch);
        throw error;
      }
      state.gitMerged = true;
    },
    async discard(task, state) {
      if (state.gitMerged) throw new Error('Git 分支已合并，请重试同步引擎');
      const current = await branch();
      if (await status()) {
        if (current !== task.branch || task.status !== 'stopped') throw new Error('工作区还有未提交的改动，请先处理');
        await ignoreCodingFiles(project);
        await assertSnapshotUntracked();
        await stage();
        if (await git('diff', '--cached', '--name-only')) await commit('保存中断的 QuankSight 迭代改动');
      }
      try {
        if (state.workspace && (await git('rev-parse', task.baseBranch)).trim() !== state.workspace.head) {
          throw new Error('原分支已变化');
        }
        if (current === task.branch) await git('switch', task.baseBranch);
        else await checkBranch(task.baseBranch);
        if (state.workspace) await restoreWorkspace(state.workspace);
        else if (state.stagedCommit) await git('cherry-pick', '--no-commit', state.stagedCommit);
      } catch (error) {
        if (!state.workspace && !state.stagedCommit) throw error;
        throw Object.assign(new Error(error.message + '。改动保留在 ' + task.branch), {kind: 'discard_restore'});
      }
      await git('branch', '-D', task.branch);
    },
  };
}
