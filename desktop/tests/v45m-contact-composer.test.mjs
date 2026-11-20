// [v45m] contact dialog close opens the quant page; home composer rounded corners
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
test('closing the WeChat contact dialog navigates to the quant page', async () => {
  const app = await read('../src/app.js');
  assert.match(app, /addEventListener\('close', \(\) => \{ quantOpen = ''; quantDetailData = null; navigate\('quant'\); \}, \{once: true\}\)/);
});
test('home composer has rounded corners', async () => {
  const css = await read('../src/workbench.css');
  assert.ok(css.includes('.qk-hero .composer{border-radius:20px!important;overflow:hidden}'));
  assert.ok(css.lastIndexOf('[v45m]') > css.lastIndexOf('[v45k]'));
});
