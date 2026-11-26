import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
test('v1.0.2 侧栏品牌：英文 QuankSight 在上、中文「量见」在下，logo 54px', () => {
  assert.match(app, /<span class="brand-en">QuankSight<\/span><span class="brand-cn">量见/);
  assert.doesNotMatch(app, /<small>量见 · 量化工作，一键搞定<\/small>/);
  assert.match(css, /\.sidebar \.brand-mark\{width:54px!important;height:54px!important/);
});
