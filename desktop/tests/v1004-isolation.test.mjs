import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = readFileSync(path.join(here, '..', 'main.mjs'), 'utf8');
const START = '// [V100-4] 自测隔离钩子';
const END = "\nif (!legacyChild) app.setName(DISPLAY_NAME);";
const a = main.indexOf(START);
assert.ok(a >= 0, 'main.mjs 缺少 V100-4 自测隔离钩子');
const b = main.indexOf(END, a);
assert.ok(b > a, '钩子块缺少结束标记');
const hook = main.slice(a, b);

function run(env) {
  const calls = [];
  const app = {
    setPath: (name, value) => calls.push([name, value]),
    getPath: name => name === 'logs' ? '/private/tmp/v1004-ud/logs' : '/private/tmp/v1004-ud',
  };
  const proc = {env};
  new Function('app', 'process', 'path', 'writeFile', hook)(app, proc, path, async () => {});
  return calls;
}

test('V100-4 自测隔离钩子在 dataDir 设置之后、app ready 之前生效', () => {
  const setData = main.indexOf("if (!legacyChild) app.setPath('userData', dataDir.dir);");
  const ready = main.indexOf('app.whenReady()', a);
  assert.ok(setData >= 0 && setData < a, '钩子必须在 dataDir 的 setPath 之后');
  assert.ok(ready > b, '钩子必须在 app.whenReady() 之前');
});

test('V100-4 QUANK_SELFTEST=1 + QUANK_USER_DATA 时 userData/sessionData/logs 都指向临时目录', () => {
  const calls = run({QUANK_SELFTEST:'1', QUANK_USER_DATA:'/private/tmp/v1004-ud'});
  assert.deepEqual(calls, [
    ['userData', '/private/tmp/v1004-ud'],
    ['sessionData', '/private/tmp/v1004-ud'],
    ['logs', '/private/tmp/v1004-ud/logs'],
  ]);
});

test('V100-4 不设 QUANK_SELFTEST 时钩子完全不生效（生产环境不隔离）', () => {
  for (const env of [
    {QUANK_USER_DATA:'/private/tmp/v1004-ud'},
    {QUANK_SELFTEST:'0', QUANK_USER_DATA:'/private/tmp/v1004-ud'},
    {QUANK_SELFTEST:'', QUANK_USER_DATA:'/private/tmp/v1004-ud'},
    {QUANK_SELFTEST:'true', QUANK_USER_DATA:'/private/tmp/v1004-ud'},
  ]) assert.deepEqual(run(env), [], '非 SELFTEST=1 时不应调用 setPath: ' + JSON.stringify(env));
});

test('V100-4 只有 QUANK_SELFTEST=1 但没有 QUANK_USER_DATA 时不生效', () => {
  assert.deepEqual(run({QUANK_SELFTEST:'1'}), []);
});
