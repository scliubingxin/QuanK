import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { officeDirectory } from '../helpers/office-kit-runtime.mjs';

const { values } = parseArgs({
  options: { 'office-dir': { type: 'string' }, help: { type: 'boolean' } },
});
if (values.help) {
  console.log('Usage: node desktop/tests/acceptance/run-office-live.mjs [--office-dir <engine program directory>]');
  process.exit(0);
}

const directory = path.resolve(values['office-dir'] ?? officeDirectory);
const separateGroup = process.platform !== 'win32';

function stopChild(child, signal) {
  if (!child.pid) return;
  if (!separateGroup) {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
const files = readdirSync(import.meta.dirname)
  .filter(file => /^(?:native-office|office-.+)-live\.mjs$/.test(file))
  .sort();

async function run(file) {
  const started = performance.now();
  let tap = '';
  const child = spawn(process.execPath, [
    '--test', '--test-force-exit', '--test-timeout=120000', '--test-reporter=tap',
    path.join(import.meta.dirname, file),
  ], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, WB_TEST_OFFICE_DIRECTORY: directory },
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: separateGroup,
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => { tap += chunk; });
  let interrupted;
  const interrupt = signal => {
    interrupted = signal;
    stopChild(child, 'SIGKILL');
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const watchdog = setTimeout(() => stopChild(child, 'SIGKILL'), 125_000);
  let exitCode, signal;
  try {
    ({ exitCode, signal } = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
    }));
  } finally {
    clearTimeout(watchdog);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    // A cancelled test may leave its native worker starting in the background.
    if (separateGroup) stopChild(child, 'SIGKILL');
  }
  if (interrupted) process.kill(process.pid, interrupted);
  const count = key => Number(tap.match(new RegExp('^# ' + key + ' (\\d+)$', 'm'))?.[1] ?? 0);
  const passed = count('pass');
  const skipped = count('skipped');
  const todo = count('todo');
  const failed = exitCode === 0 && passed + todo > 0 && skipped === 0 ? 0 : Math.max(1, count('fail') + count('cancelled') + skipped);
  if (failed || todo) process.stderr.write(tap + (signal ? 'Process ended with ' + signal + '\n' : ''));
  const status = failed ? '失败' : todo ? '产品缺陷' : '通过';
  return { file, status, passed, failed, skipped, todo, exitCode, signal, durationMs: Math.round(performance.now() - started) };
}

const results = [];
for (const file of files) {
  console.error('Running ' + file);
  results.push(await run(file));
}

const passed = results.filter(result => result.status === '通过').length;
const failed = results.filter(result => result.status === '失败').length;
const productDefects = results.filter(result => result.status === '产品缺陷').length;
console.error('文件\t结果\t耗时（秒）');
for (const result of results) {
  console.error(result.file + '\t' + result.status + '\t' + (result.durationMs / 1000).toFixed(2));
}
console.log(JSON.stringify({ officeDirectory: directory, passed, failed, productDefects, results }, null, 2));
process.exitCode = failed || !results.length ? 1 : 0;
