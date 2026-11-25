// [v45] Release 0.45: README, video, DMG installer, engine-card button fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');

test('README links to the latest DMG, release history and screenshots', async () => {
  const md = await read('../../README.md');
  for (const section of ['一分钟看懂 QuankSight', '下载与安装', '核心能力', '界面一览', '隐私与安全', '常见问题'])
    assert.ok(md.includes(`## ${section}`), section);
  assert.match(md, /\[发布记录\]\(docs\/releases\/README\.md\)/);
  assert.match(md, /releases\/latest\) 下载最新的 `QuankSight-v<版本>-mac-arm64\.dmg`/);
  assert.doesNotMatch(md, /^## 更新记录|^- \*\*v\d+/m);
  assert.ok(md.indexOf('## 下载与安装') < md.indexOf('## 核心能力'));
  for (const [, image] of md.matchAll(/\((docs\/images\/[^)]+)\)/g))
    assert.ok((await stat(new URL(`../../${image}`, import.meta.url))).isFile(), image);
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
