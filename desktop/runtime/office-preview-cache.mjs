import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readdir, lstat, rename, rm, utimes, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {readPreviewPdf} from './office-preview-pool.mjs';

export function createOfficePreviewCache({directory, allowed = () => true, maxBytes = 500 * 1000 ** 2}) {
  let queue = Promise.resolve();
  function serial(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }

  const fileFor = ({sha256, revision, engineVersion, fontFingerprint}) => path.join(directory, createHash('sha256')
    .update(JSON.stringify([sha256, revision, engineVersion, fontFingerprint])).digest('hex') + '.pdf');

  async function trim() {
    const entries = [];
    for (const name of await readdir(directory)) {
      if (/^[a-f0-9-]{36}\.tmp$/.test(name)) await rm(path.join(directory, name), {force: true});
      if (!/^[a-f0-9]{64}\.pdf$/.test(name)) continue;
      const file = path.join(directory, name), stat = await lstat(file);
      if (stat.isFile()) entries.push({file, size: stat.size, time: stat.mtimeMs});
    }
    entries.sort((a, b) => a.time - b.time);
    let size = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries) {
      if (size <= maxBytes) break;
      await rm(entry.file);
      size -= entry.size;
    }
  }

  return {
    get(document) {
      return serial(async () => {
        if (!allowed()) return null;
        const file = fileFor(document);
        try {
          const bytes = await readPreviewPdf(file);
          const now = new Date();
          await utimes(file, now, now);
          return allowed() ? bytes : null;
        } catch { return null; }
      });
    },
    put(document, bytes) {
      return serial(async () => {
        if (!allowed() || bytes.length > maxBytes) return;
        await mkdir(directory, {recursive: true, mode: 0o700});
        const temp = path.join(directory, randomUUID() + '.tmp');
        try {
          await writeFile(temp, bytes, {flag: 'wx', mode: 0o600});
          if (allowed()) {
            await rename(temp, fileFor(document));
            await trim();
          }
        } finally { await rm(temp, {force: true}); }
      });
    },
    clear: () => serial(() => rm(directory, {recursive: true, force: true})),
  };
}
