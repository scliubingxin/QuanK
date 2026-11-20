import test from 'node:test';
import assert from 'node:assert/strict';
import {
  percentToScale, scaleToPercent, clampPercent, stepPercent, fitPercent, layoutOfficeView, planSnapshotTiles,
  canvasPointToDocument, documentRectToBitmap, anchoredPan, validateSnapshotPng, SNAPSHOT_LIMITS, PAGE_MARGIN
} from '../src/shared/office-zoom.js';
import {detectFontSubstitutions, FONT_SUBSTITUTIONS} from '../src/shared/office-font-map.js';
import {fontAliasXml} from '../runtime/office-fonts.mjs';

const PAGES = {'16:9': [19200, 10800], '4:3': [14400, 10800], '16:10': [17280, 10800]};

test('percent and scale convert both ways with 10%-400% bounds', () => {
  assert.equal(percentToScale(100), 15);
  assert.equal(percentToScale(50), 30);
  assert.equal(percentToScale(150), 10);
  assert.equal(percentToScale(1), percentToScale(10));
  assert.equal(percentToScale(9999), percentToScale(400));
  assert.equal(scaleToPercent(15), 100);
  assert.equal(scaleToPercent(7.5), 200);
  assert.equal(scaleToPercent(0), null);
  assert.equal(clampPercent(NaN), null);
  for (const p of [10, 25, 78, 100, 400]) assert.ok(Math.abs(scaleToPercent(percentToScale(p)) - p) < 1e-9);
});

test('zoom steps snap to multiples of 10 and stop at the limits', () => {
  assert.equal(stepPercent(100, 1), 110);
  assert.equal(stepPercent(100, -1), 90);
  assert.equal(stepPercent(78, 1), 80);
  assert.equal(stepPercent(78, -1), 70);
  assert.equal(stepPercent(10, -1), 10);
  assert.equal(stepPercent(400, 1), 400);
  assert.equal(stepPercent(395, 1), 400);
  assert.equal(stepPercent(100, 0), null);
});

test('fit to window keeps the whole page inside the viewport for every page ratio', () => {
  const windows = [[1200, 700], [800, 900], [1600, 600], [2560, 1300], [500, 400]];
  for (const [name, [pw, ph]] of Object.entries(PAGES)) for (const [vw, vh] of windows) {
    const percent = fitPercent({pageWidth: pw, pageHeight: ph, viewWidth: vw, viewHeight: vh});
    const view = layoutOfficeView({pageWidth: pw, pageHeight: ph, viewWidth: vw, viewHeight: vh, percent});
    const label = name + ' in ' + vw + 'x' + vh;
    if (percent > 10) {
      assert.ok(view.cssWidth <= vw - 2 * PAGE_MARGIN + 1 && view.cssHeight <= vh - 2 * PAGE_MARGIN + 1, label);
      assert.equal(view.x, 0, label); assert.equal(view.y, 0, label);
      assert.equal(view.tileWidth, pw, label);
      assert.ok(Math.abs(view.cssLeft + view.cssWidth / 2 - vw / 2) <= 1, 'centered x ' + label);
      assert.ok(Math.abs(view.cssTop + view.cssHeight / 2 - vh / 2) <= 1, 'centered y ' + label);
    }
  }
  assert.equal(fitPercent({pageWidth: 19200, pageHeight: 10800, viewWidth: 1200, viewHeight: 700}), 90);
  assert.equal(fitPercent({pageWidth: 19200, pageHeight: 10800, viewWidth: 100, viewHeight: 100}), 10);
  assert.equal(fitPercent({pageWidth: 100, pageHeight: 100, viewWidth: 99999, viewHeight: 99999}), 400);
  assert.equal(fitPercent({pageWidth: 0, pageHeight: 1, viewWidth: 1, viewHeight: 1}), null);
  assert.equal(fitPercent({pageWidth: 12240, pageHeight: 999999, viewWidth: 1000, viewHeight: 500, mode: 'width'}), 116.66);
});

test('Retina bitmaps are twice the CSS size while CSS size and document window stay unchanged', () => {
  const base = {pageWidth: 19200, pageHeight: 10800, viewWidth: 1200, viewHeight: 700, percent: 90};
  const one = layoutOfficeView({...base, dpr: 1}), two = layoutOfficeView({...base, dpr: 2});
  assert.equal(two.width, one.width * 2); assert.equal(two.height, one.height * 2);
  assert.equal(two.cssWidth, one.cssWidth);
  assert.equal(two.tileWidth, one.tileWidth); assert.equal(two.tileHeight, one.tileHeight);
  assert.equal(layoutOfficeView({...base, dpr: 99}).dpr, 4);
  assert.equal(layoutOfficeView({...base, dpr: -1}).dpr, 1);
});

test('zoomed-in layouts clamp pan and request only the visible slice', () => {
  const v = layoutOfficeView({pageWidth: 19200, pageHeight: 10800, viewWidth: 1000, viewHeight: 600, percent: 200, panX: 100, panY: 1e9, dpr: 2});
  assert.equal(v.cssWidth, 1000); assert.equal(v.cssHeight, 600 - PAGE_MARGIN); // bottom margin stays visible at max pan
  assert.equal(v.panY, v.maxPanY);
  assert.equal(v.tileWidth, 7500); // 1000 css px at 200% = 500 doc px = 7500 twips
  assert.equal(v.x, Math.round((100 - PAGE_MARGIN) * 7.5)); // pan 100 css px, 24 px of it is the margin
  assert.equal(v.width, 2000);
  assert.ok(v.y > 0 && v.y + v.tileHeight <= 10800 + 20);
});

test('large bitmaps are split into stitched tiles inside the request limits', () => {
  const v = layoutOfficeView({pageWidth: 19200, pageHeight: 10800, viewWidth: 2400, viewHeight: 1300, percent: 150, dpr: 2});
  const tiles = planSnapshotTiles(v);
  assert.ok(tiles.length > 1);
  assert.ok(tiles.every(t => t.width <= 2048 && t.height <= 1536 && t.width <= SNAPSHOT_LIMITS.maxWidth && t.height <= SNAPSHOT_LIMITS.maxHeight));
  assert.equal(tiles.reduce((n, t) => n + t.width * t.height, 0), v.width * v.height);
  const last = tiles.at(-1);
  assert.equal(last.sx + last.width, v.width); assert.equal(last.sy + last.height, v.height);
  assert.ok(Math.abs(last.x + last.tileWidth - (v.x + v.tileWidth)) <= 2);
  assert.deepEqual(planSnapshotTiles(null), []);
  assert.equal(planSnapshotTiles(layoutOfficeView({pageWidth: 19200, pageHeight: 10800, viewWidth: 1200, viewHeight: 700, percent: 90, dpr: 2})).length, 2);
});

test('pointer positions map to document twips for any zoom and DPR, and ignore the margin', () => {
  for (const dpr of [1, 2]) for (const percent of [50, 90, 100, 250]) {
    const v = layoutOfficeView({pageWidth: 19200, pageHeight: 10800, viewWidth: 1200, viewHeight: 700, percent, panX: 30, panY: 20, dpr});
    const rect = {left: 300 + v.cssLeft, top: 80 + v.cssTop, width: v.cssWidth, height: v.cssHeight};
    const p = canvasPointToDocument({clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2}, rect, v);
    assert.ok(Math.abs(p.x - (v.x + v.tileWidth / 2)) <= 1);
    assert.ok(Math.abs(p.y - (v.y + v.tileHeight / 2)) <= 1);
    // the pixel under the cursor is the same one the selection overlay draws at
    const b = documentRectToBitmap({x: p.x, y: p.y, width: 0, height: 0}, v);
    assert.ok(Math.abs(b.x / dpr - rect.width / 2) <= 1.5 && Math.abs(b.y / dpr - rect.height / 2) <= 1.5);
  }
  const v = layoutOfficeView({pageWidth: 19200, pageHeight: 10800, viewWidth: 1200, viewHeight: 700, percent: 90});
  const rect = {left: 100, top: 100, width: v.cssWidth, height: v.cssHeight};
  assert.equal(canvasPointToDocument({clientX: 99, clientY: 150}, rect, v), null);
  assert.equal(canvasPointToDocument({clientX: 150, clientY: 100 + v.cssHeight + 1}, rect, v), null);
  assert.deepEqual(canvasPointToDocument({clientX: 0, clientY: 0}, rect, v, {clamp: true}), {x: v.x, y: v.y});
  assert.equal(canvasPointToDocument({clientX: 1, clientY: 1}, {left: 0, top: 0, width: 0, height: 0}, v), null);
});

test('zoom keeps the document point under the anchor fixed', () => {
  const page = {pageWidth: 19200, pageHeight: 10800, viewWidth: 1000, viewHeight: 600};
  const before = layoutOfficeView({...page, percent: 100, panX: 200, panY: 100});
  const anchor = {anchorX: 400, anchorY: 300};
  const docAt = (l, p) => ({x: (anchor.anchorX - l.pageLeft) / (p / 100), y: (anchor.anchorY - l.pageTop) / (p / 100)});
  const pan = anchoredPan({...page, oldPercent: 100, newPercent: 150, panX: 200, panY: 100, ...anchor});
  const after = layoutOfficeView({...page, percent: 150, panX: pan.panX, panY: pan.panY});
  const a = docAt(before, 100), b = docAt(after, 150);
  assert.ok(Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1);
});

function png(width, height, extra = 0) {
  const b = Buffer.alloc(33 + extra); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20);
  return b.toString('base64');
}
test('snapshot validation allows 2x Retina pages and still rejects oversize or forged data', () => {
  assert.deepEqual(validateSnapshotPng(png(4096, 2560), {width: 4096, height: 2560}), {width: 4096, height: 2560, bytes: 33});
  assert.equal(validateSnapshotPng(png(2560, 1440, 5 * 1024 * 1024)).bytes, 33 + 5 * 1024 * 1024);
  assert.throws(() => validateSnapshotPng(png(4097, 100)), /尺寸超限/);
  assert.throws(() => validateSnapshotPng(png(100, 2561)), /尺寸超限/);
  assert.throws(() => validateSnapshotPng(png(0, 10)), /尺寸超限/);
  assert.throws(() => validateSnapshotPng(png(10, 10, SNAPSHOT_LIMITS.maxPngBytes)), /超限|无效/);
  assert.throws(() => validateSnapshotPng(png(10, 10), {width: 11, height: 10}), /不一致/);
  assert.throws(() => validateSnapshotPng(Buffer.from('not a png at all, definitely more than thirty-three bytes').toString('base64')), /不是PNG/);
  assert.throws(() => validateSnapshotPng('***'), /无效/);
  assert.throws(() => validateSnapshotPng(''), /无效/);
  assert.throws(() => validateSnapshotPng(undefined), /无效/);
});

test('font substitution table reports only missing fonts and escapes into fontconfig aliases', () => {
  const installed = ['PingFang SC', 'Helvetica Neue', 'Arial'];
  assert.deepEqual(detectFontSubstitutions(['微软雅黑', 'Calibri', 'Arial', 'Unknown Font', '微软雅黑'], installed), [
    {from: '微软雅黑', to: 'PingFang SC'}, {from: 'Calibri', to: 'Helvetica Neue'}
  ]);
  assert.deepEqual(detectFontSubstitutions(['宋体'], ['Songti SC']), [{from: '宋体', to: 'Songti SC'}]);
  assert.deepEqual(detectFontSubstitutions(['微软雅黑'], ['微软雅黑']), []);
  assert.deepEqual(detectFontSubstitutions(null, null), []);
  const xml = fontAliasXml();
  for (const name of ['微软雅黑', 'Microsoft YaHei', '等线', '宋体', 'Calibri', 'Arial', 'PingFang SC', 'Hiragino Sans GB', 'STHeiti', 'Helvetica Neue']) assert.ok(xml.includes('<family>' + name + '</family>'), name);
  assert.ok(FONT_SUBSTITUTIONS.every(r => r.from.length && r.to.length));
  assert.ok(xml.includes('<accept>'));
});
