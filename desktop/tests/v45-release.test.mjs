// [v45] Release 0.45: README, video, DMG installer, engine-card button fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');

test('README introduces QuanK 0.45 with the DMG installer and the product video', async () => {
  const md = await read('../../README.md');
  for (const s of ['## 一分钟看懂 QuanK', '## 下载与安装', '## 核心能力', '## 界面一览', '## 隐私与安全', '## 常见问题', '## 更新记录', '**v0.45**', 'QuanK-0.45.0-arm64.dmg', 'macOS 12'])
    assert.ok(md.includes(s), s);
  // [v0.54.1] demo video/gif links were retired in v0.53; the README now uses current screenshots.
  for (const f of ['docs/images/app-home.png', 'docs/images/app-home-cards.png', 'docs/images/app-quant-holdings.png', 'docs/images/app-chat-research.png'])
    assert.ok(md.includes(f), f);
  for (const f of ['../../docs/images/app-home.png', '../../docs/images/app-narrow.png'])
    assert.ok((await stat(new URL(f, import.meta.url))).size > 10000, f);
  assert.ok(md.indexOf('## 下载与安装') < md.indexOf('## 核心能力') && md.indexOf('## 核心能力') < md.indexOf('## 更新记录'));
});

test('quant engine card keeps its buttons on one line each', async () => {
  const css = await read('../src/workbench.css');
  assert.match(css, /\[v45\][\s\S]*\.quant-engine \.pc-actions\{flex-wrap:wrap\}/);
  assert.match(css, /\.pc-actions>\*\{white-space:nowrap;flex:0 0 auto\}/);
});

test('screenshot script uses the demo harness; DMG script lays out drag-to-install', async () => { // [v45r] demo video is now the user's own recording
  const harness = await read('../scripts/demo-harness.mjs');
  assert.match(harness, /financeDemo\(demoState\(\)\)/);
  const dmg = await read('../../scripts/make-dmg.sh');
  for (const s of ['ln -s /Applications', 'hdiutil convert', '-format ULFO', '首次打开.command', 'hdiutil verify']) assert.ok(dmg.includes(s), s);
});
