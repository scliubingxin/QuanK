import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');

test('layout: the shell never scrolls sideways and the chat keeps its composer', async () => {
  const css = await read('../src/workbench.css');
  const tail = css.slice(css.lastIndexOf('[resp]'));
  for (const k of ['html,body{width:100%;height:100%;overflow:hidden}', '#app{width:100vw;max-width:100vw;overflow:hidden}', '.main{overflow:hidden}',
    '.conversation-space .messages-scroll{flex:1 1 0!important;min-height:0!important', '.conversation-space .chat>.composer-dock', '.topbar>div:last-child{min-width:0;flex:0 1 auto;overflow:hidden}'])
    assert.ok(tail.includes(k), k);
  assert.ok(css.lastIndexOf('[resp]') > css.lastIndexOf('[theme2]'), 'responsive rules come last');
});

test('layout: breakpoints for sidebar, topbar and the home grid', async () => {
  const css = await read('../src/workbench.css'), tail = css.slice(css.lastIndexOf('[resp]'));
  assert.match(tail, /@media\(max-width:980px\)\{\s*\.sidebar\{width:66px!important/);
  assert.match(tail, /@media\(max-width:1280px\)\{\.qk-col-8\{grid-column:span 12\}/);
  assert.match(tail, /@media\(max-width:1100px\)\{\.qk-col-6\{grid-column:span 12\}/);
  assert.match(tail, /\.qk-grid>div>section,\.qk-grid>div>\.home-quant\{min-width:0;max-width:100%\}/);
  assert.match(tail, /div\.hq-grid>button\.hq-stock\{display:grid!important/);
  const app = await read('../src/app.js');
  assert.match(app, /\[resp\] never leave the shell scrolled sideways/);
});
