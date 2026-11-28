// QuankSight deck engine bridge: spec -> built-in Python -> native editable .pptx.
// All scratch files are removed immediately after generation; encrypted sessions keep
// scratch only under userData/deck/tmp (never the system temp directory).
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledExecutable } from './bundled-runtime.mjs';

// [v1.0.8] Packaged builds keep runtime/deck in app.asar.unpacked: the bundled Python cannot read files inside the archive.
export function unpackedPath(p) { return String(p).replace(/([\\/])app\.asar(?=[\\/]|$)/, '$1app.asar.unpacked'); }
const HERE = unpackedPath(path.dirname(fileURLToPath(import.meta.url)));
export const DECK_DIR = path.join(HERE, 'deck');
export const SCRIPT = path.join(DECK_DIR, 'build_deck.py');
export const THEMES = Object.freeze(['research', 'report', 'product']);
export const LAYOUTS = Object.freeze({
  research: ['cover', 'summary', 'company', 'financials', 'valuation', 'chart', 'signals', 'catalysts_risks', 'event', 'disclaimer'],
  report: ['cover', 'toc', 'part', 'content', 'image', 'thanks'],
  product: ['cover', 'toc', 'section', 'scenarios', 'split', 'stats', 'media', 'feature', 'compare', 'closing'],
});
const MISSING_PY = '缺少内置 Python 运行包或 python-pptx / lxml 依赖，无法生成 PPT。请在「设置 → 运行环境」修复内置 Python 后重试。';

function childEnv(source = process.env) {
  const env = {};
  for (const name of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'PATH']) {
    if (source[name]) env[name] = source[name];
  }
  env.PYTHONIOENCODING = 'utf-8';
  env.PYTHONDONTWRITEBYTECODE = '1';
  return env;
}

export function createDeckEngine({ userData = os.tmpdir(), encrypted = () => false, python: pythonOverride = null, now = Date.now } = {}) {
  async function pythonExecutable() {
    if (pythonOverride) return pythonOverride;
    try {
      const builtin = await bundledExecutable('python');
      if (builtin) return builtin;
    } catch { /* dev / no bundled runtime */ }
    return process.env.WB_TEST_PYTHON || process.env.QUANK_PYTHON || 'python3';
  }

  async function run(args, { timeoutMs = 120000, input = null, allowFailure = false } = {}) {
    const exe = await pythonExecutable();
    return await new Promise((resolve, reject) => {
      let child, stdout = '', stderr = '', settled = false;
      const timer = setTimeout(() => { try { child?.kill('SIGKILL'); } catch {} }, timeoutMs);
      try {
        child = spawn(exe, [SCRIPT, ...args], {
          env: childEnv(), shell: false, windowsHide: true,
          stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        });
      } catch (e) { clearTimeout(timer); reject(new Error(MISSING_PY + ' ' + e.message)); return; }
      if (input !== null) { child.stdin.setEncoding('utf8'); child.stdin.end(input); }
      for (const [stream, field] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
        stream.setEncoding('utf8');
        stream.on('data', chunk => { if (field === 'stdout') stdout += chunk; else stderr += chunk; });
      }
      child.on('error', e => { if (settled) return; settled = true; clearTimeout(timer); reject(new Error(MISSING_PY + ' ' + e.message)); });
      child.on('close', (code) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (code !== 0 && !allowFailure) {
          if (code === 3 || /python-pptx|lxml|ModuleNotFoundError/.test(stderr)) reject(new Error(MISSING_PY));
          else reject(new Error(stderr.trim().slice(-600) || stdout.trim().slice(-600) || 'PPT 生成失败'));
          return;
        }
        resolve({ stdout, stderr, elapsedMs: 0 });
      });
    });
  }

  function parseJson(stdout) {
    try { return JSON.parse(stdout.trim().split('\n').pop()); }
    catch { throw new Error('PPT 引擎返回了无法解析的结果：' + stdout.slice(-300)); }
  }

  async function scratch() {
    if (encrypted()) {
      const base = path.join(String(userData), 'deck', 'tmp');
      await mkdir(base, { recursive: true });
      return mkdtemp(path.join(base, 'build-'));
    }
    return mkdtemp(path.join(os.tmpdir(), 'quank-deck-'));
  }

  /** Confirmed outline -> full spec (no pptx built yet). */
  async function toSpec({ outline, theme = 'research', title = '' } = {}) {
    const dir = await scratch();
    try {
      const outlinePath = path.join(dir, 'outline.json');
      const specPath = path.join(dir, 'spec.json');
      await writeFile(outlinePath, JSON.stringify(outline), 'utf8');
      const args = ['--outline', outlinePath, '--theme', THEMES.includes(theme) ? theme : 'research', '--json', '--spec-out', specPath];
      if (title) args.push('--title', String(title).slice(0, 200));
      const r = await run(args);
      const result = parseJson(r.stdout);
      if (!result.ok) throw new Error((result.errors || []).join('；') || '大纲无法转换为 spec');
      return JSON.parse(await readFile(specPath, 'utf8'));
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  async function check(spec) {
    const dir = await scratch();
    try {
      const specPath = path.join(dir, 'spec.json');
      await writeFile(specPath, JSON.stringify(spec), 'utf8');
      const r = await run(['--spec', specPath, '--check', '--json'], {allowFailure: true});
      return parseJson(r.stdout);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  async function build({ spec, dataMap = null, outline = null, theme = 'research', title = '',
                         maskAmounts = false, sourceAsOf = '', timeoutMs = 180000 } = {}) {
    const started = Date.now();
    const dir = await scratch();
    try {
      const specPath = path.join(dir, 'spec.json');
      const outPath = path.join(dir, 'deck.pptx');
      const args = ['--json', '--out', outPath, '--theme', THEMES.includes(theme) ? theme : 'research'];
      if (outline) {
        await writeFile(path.join(dir, 'outline.json'), JSON.stringify(outline), 'utf8');
        args.push('--outline', path.join(dir, 'outline.json'));
        if (title) args.push('--title', String(title).slice(0, 200));
      } else {
        await writeFile(specPath, JSON.stringify(spec), 'utf8');
        args.push('--spec', specPath);
      }
      if (dataMap && Object.keys(dataMap).length) {
        await writeFile(path.join(dir, 'data.json'), JSON.stringify(dataMap), 'utf8');
        args.push('--data', path.join(dir, 'data.json'));
      }
      if (maskAmounts) args.push('--mask-amounts');
      if (sourceAsOf) args.push('--source-as-of', String(sourceAsOf).slice(0, 80));
      const r = await run(args, { timeoutMs });
      const result = parseJson(r.stdout);
      if (!result.ok) throw new Error((result.errors || []).join('；') || 'PPT spec 校验失败');
      const bytes = await readFile(outPath);
      return { ...result, bytes, elapsedMs: Date.now() - started, tempMode: encrypted() ? 'userData' : 'system' };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async function catalog() {
    const r = await run(['--catalog']);
    return parseJson(r.stdout);
  }

  return { build, toSpec, check, catalog, pythonExecutable, THEMES, LAYOUTS, DECK_DIR, now };
}
