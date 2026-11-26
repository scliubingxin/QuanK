import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultOfficeZoom, stepZoom, clampOfficeZoom, officePageStatus} from '../src/office/office-canvas.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = file => readFileSync(path.join(here, '..', file), 'utf8');

test('v1.0.3 默认缩放：PPT 适合页面但不超过 90%，Word 适合宽度但不超过 100%，最小 25%', () => {
  assert.equal(defaultOfficeZoom({kind:'impress', fitPage:1.4, fitWidth:1.6}), .9);
  assert.equal(defaultOfficeZoom({kind:'impress', fitPage:.62, fitWidth:.8}), .62);
  assert.equal(defaultOfficeZoom({kind:'writer', fitPage:.5, fitWidth:1.8}), 1);
  assert.equal(defaultOfficeZoom({kind:'writer', fitPage:.3, fitWidth:.71}), .71);
  assert.equal(defaultOfficeZoom({kind:'writer', fitPage:.01, fitWidth:.05}), .25, '不再出现 5%');
  assert.equal(defaultOfficeZoom({kind:'calc'}), 1);
  assert.equal(clampOfficeZoom(.05), .25);
  assert.equal(clampOfficeZoom(9), 2);
});

test('v1.0.3 缩放按钮：200% 能一路缩小，非整格先对齐到 10% 网格', () => {
  let z = 2;
  for (let i = 0; i < 5; i++) z = stepZoom(z, -1);
  assert.equal(z, 1.5);
  assert.equal(stepZoom(2, 1), 2);
  assert.equal(stepZoom(.25, -1), .25);
  assert.equal(stepZoom(.62, 1), .7);
  assert.equal(stepZoom(.62, -1), .6);
  assert.equal(stepZoom(.9, 1), 1);
});

test('v1.0.3 状态栏页码', () => {
  assert.equal(officePageStatus({kind:'impress', part:1, parts:14}).text, '第 2 张 / 共 14 张');
  assert.equal(officePageStatus({kind:'calc', part:0, parts:3}).text, '工作表 1 / 3');
  const w = officePageStatus({kind:'writer', height:16838 * 3, pageHeight:16838, scrollTop:1200, clientHeight:900, scale:15});
  assert.equal(w.total, 3);
  assert.equal(w.current, 2);
});

test('v1.0.3 画布撑满窗口、工具栏固定在顶部、缩放在底部状态栏', () => {
  const canvas = src('src/office/office-canvas.js');
  assert.match(canvas, /className:'quank-office-canvas'\}, \{[^}]*flex:'1 1 auto'[^}]*minWidth:'0'/);
  assert.doesNotMatch(canvas, /Math\.max\(\.05,/);
  const win = src('src/office/window.js');
  assert.match(win, /editor\.insertBefore\(toolbar\.element, host\)/);
  assert.doesNotMatch(win, /canvas\.element\.prepend\(toolbar\.element\)/);
  assert.match(win, /statusBar\.append\(canvas\.zoomControl\)/);
  assert.match(win, /params\.get\('name'\)/);
  assert.match(src('src/office/window.html'), /\.qk-win-status\{/);
  assert.match(src('main/office-edit-windows.mjs'), /name:documentName/);
});

test('v1.0.3 页面上的确认卡会滚动到可见处（半自动委托「下单」「撤销」）', () => {
  const app = src('src/app.js');
  const body = app.slice(app.indexOf('function inlineConfirm('), app.indexOf('function paintApprovalSummaries('));
  assert.match(body, /revealApproval\(target, requestId\)/);
});

test('v1.0.3 AI 写入确认卡参数正确，不再出现 [object HTMLDivElement] 竖条', () => {
  const win = src('src/office/window.js');
  assert.doesNotMatch(win, /decision\(panel, '允许 AI/);
  assert.match(win, /showOfficeDecision\(host, '允许 AI 将这项修改写入文档？'/);
  assert.match(src('src/office/window.html'), /width:min\(560px,calc\(100vw - 32px\)\)/);
});
