import { appendFile, chmod, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { datasetStats, toJsonl } from './dataset.mjs';
import { maskAmounts, normalizePrivacy } from '../src/shared/privacy.js';

const LIMIT = 20 * 1024 * 1024;
const safeName = value => String(value ?? '').replace(/[^\w-]/g, '_').slice(0, 100) || 'general';
const json = value => JSON.stringify(value, null, 2);

export async function localEntry(file) {
  const entry = await lstat(file).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (entry?.isSymbolicLink() || (entry?.isFile() && entry.nlink !== 1)) throw new Error('Coding 文件路径不能使用链接');
  return entry;
}

export async function ignoreCodingFiles(project) {
  const file = path.join(project, '.gitignore');
  const entry = await localEntry(file);
  if (entry && !entry.isFile()) throw new Error('.gitignore 必须是普通文件');
  const content = entry ? await readFile(file, 'utf8') : '';
  if (content.split(/\r?\n/).includes('.quank/')) return false;
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  await appendFile(file, (content && !content.endsWith('\n') ? newline : '') + '.quank/' + newline);
  return true;
}

export async function clearCodingContext(project) {
  const root = path.join(project, '.quank');
  const rootEntry = await localEntry(root);
  if (!rootEntry) return;
  if (!rootEntry.isDirectory()) throw new Error('.quank 必须是目录');
  const dir = path.join(root, 'context');
  const entry = await localEntry(dir);
  if (!entry) return;
  if (!entry.isDirectory()) throw new Error('Coding 上下文必须是目录');
  async function writable(directory) {
    await chmod(directory, 0o700);
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.isDirectory()) await writable(path.join(directory, item.name));
    }
  }
  await writable(dir);
  await rm(dir, { recursive: true });
}

export async function createCodingContext(project, { store, quant, research, memory, dataset, check = () => {} }) {
  check();
  const root = path.join(project, '.quank');
  await localEntry(root);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await localEntry(path.join(root, 'reports'));
  await mkdir(path.join(root, 'reports'), { recursive: true, mode: 0o700 });

  const files = [];
  const put = (name, content, at = Infinity) => files.push({ name, content, at, bytes: Buffer.byteLength(content) });
  const entries = research?.view?.()?.library ?? store.data.research?.library ?? [];
  for (const [i, entry] of entries.entries()) {
    check();
    // Saved announcement summaries are already local. Reading a notice may fetch its PDF.
    const item = entry.kind === 'notice' ? entry
      : await research?.handle?.({ action: 'read', id: entry.id }).catch(() => entry) ?? entry;
    const name = safeName(entry.id) + '-' + i;
    const at = +new Date(entry.edited || entry.at || entry.createdAt || entry.date || 0);
    const body = [item.title ? '# ' + item.title : '', item.summary, ...(item.points || []).slice(0, 12), item.text || item.preview].filter(Boolean).join('\n\n').slice(0, 16000);
    if (entry.kind === 'quant') {
      put('reports/' + name + '.md', body, at);
      put('reports/' + name + '.json', json(item.metrics || []), at);
    } else put('research/' + safeName(item.code) + '/' + name + '.md', body, at);
  }
  for (const [i, id] of Object.keys(store.data.quant?.reports || {}).entries()) {
    check();
    const report = await quant?.handle?.({ action: 'report', id }).catch(() => null);
    if (!report) continue;
    const name = 'engine-' + safeName(id) + '-' + i;
    const at = +new Date(report.at || report.date || 0);
    put('reports/' + name + '.md', String(report.md || report.summary || '').slice(0, 32000), at);
    put('reports/' + name + '.json', json(report.metrics || []), at);
  }

  const rows = [...(await dataset?.load?.() ?? [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const data = rows.map(row => ({ row, body: toJsonl([row]) }));
  const memories = typeof memory === 'function' ? await memory() : memory?.list?.() ?? store.data.memories ?? [];
  put('memory.md', '# 量化记忆\n\n' + memories.map(m => String(m.text || m)).filter(t => /量化|策略|回测|股票|持仓|交易|收益|盯盘|定投|风控|止损|买点|卖点|\b(?:backtest|trading|drawdown|portfolio|stop.loss)\b/i.test(t)).map(t => '- ' + t.slice(0, 3000)).join('\n'));
  const { maskAmounts: mask } = normalizePrivacy(store.data.security?.privacy);
  for (const key of ['pool', 'holdings']) {
    const value = store.data.quant?.[key] ?? (key === 'pool' ? [] : {});
    put(key + '.json', json(mask ? maskAmounts(value).result : value));
  }

  // Trim research/report files and dataset rows against the same time-ordered budget.
  const sources = [...files, ...data.map((entry, index) => ({
    index, at: +new Date(entry.row.date || 0), bytes: Buffer.byteLength(entry.body),
  }))].sort((a, b) => b.at - a.at);
  const kept = new Set();
  let bytes = 0;
  for (const entry of sources) {
    if (bytes + entry.bytes > LIMIT - 65536) break;
    kept.add(entry);
    bytes += entry.bytes;
  }
  const selected = sources.filter(entry => entry.index !== undefined && kept.has(entry)).map(entry => data[entry.index].row).reverse();
  const keptFiles = files.filter(file => kept.has(file));
  keptFiles.push({ name: 'dataset/quank_dataset.jsonl', content: selected.length ? toJsonl(selected) : '' },
    { name: 'dataset/hit-rates.json', content: json(datasetStats(selected)) });
  bytes = keptFiles.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
  if (bytes > LIMIT || keptFiles.filter(file => ['pool.json', 'holdings.json', 'memory.md'].includes(file.name)).length !== 3) {
    throw new Error('量化上下文基础文件超过 20 MB');
  }

  check();
  await clearCodingContext(project);
  const dir = path.join(root, 'context');
  await mkdir(dir);
  const directories = new Set([dir]);
  try {
    for (const folder of ['research', 'reports', 'dataset']) {
      const target = path.join(dir, folder);
      await mkdir(target);
      directories.add(target);
    }
    for (const file of keptFiles) {
      check();
      const target = path.join(dir, file.name);
      await mkdir(path.dirname(target), { recursive: true });
      directories.add(path.dirname(target));
      await writeFile(target, file.content, { flag: 'wx', mode: 0o444 });
    }
    for (const directory of directories) await chmod(directory, 0o555);
    return bytes;
  } catch (error) {
    await clearCodingContext(project);
    throw error;
  }
}
