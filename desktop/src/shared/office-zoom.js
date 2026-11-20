// The LibreOfficeKit tile scale is document units per pixel: larger means zoom out.
export function fitOfficePage(width, height, tileWidth, tileHeight) {
  if (![width, height, tileWidth, tileHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const required = Math.ceil(Math.max(width / tileWidth, height / tileHeight));
  return Math.max(8, Math.min(30, required));
}

export function stepOfficeZoom(scale, direction) {
  if (!Number.isInteger(scale) || ![-1, 1].includes(direction)) return null;
  return Math.max(8, Math.min(30, scale + direction));
}

// Clip pixels outside the current slide instead of displaying the native tile's padding.
export function officeSlideTileSize(shot) {
  const {width, height, documentWidth, documentHeight, x, y, scale} = shot || {};
  if (![width, height, documentWidth, documentHeight, x, y, scale].every(Number.isFinite) || scale <= 0 || width <= 0 || height <= 0) return null;
  return {
    width: Math.max(1, Math.min(width, Math.ceil((documentWidth - x) / scale))),
    height: Math.max(1, Math.min(height, Math.ceil((documentHeight - y) / scale)))
  };
}

// ---- [lane:render] percent-based zoom, DPR-aware layout and snapshot limits ----
// Document units are twips. At 100% one CSS pixel is 15 twips (96 dpi).
export const TWIPS_PER_PX = 15;
export const ZOOM_MIN = 10, ZOOM_MAX = 400, ZOOM_STEP = 10;
export const PAGE_MARGIN = 24;
export const SNAPSHOT_LIMITS = Object.freeze({maxWidth: 4096, maxHeight: 2560, maxPngBytes: 24 * 1024 * 1024, maxTileWidth: 2048, maxTileHeight: 1536});

export function clampPercent(percent) {
  if (!Number.isFinite(percent)) return null;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, percent));
}
// Twips per CSS pixel for a percentage (100% -> 15).
export function percentToScale(percent) {
  const p = clampPercent(percent);
  return p === null ? null : TWIPS_PER_PX * 100 / p;
}
export function scaleToPercent(scale) {
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return clampPercent(TWIPS_PER_PX * 100 / scale);
}
// Step to the next multiple of 10: 78 -> 80 / 70, 100 -> 110 / 90.
export function stepPercent(percent, direction) {
  if (!Number.isFinite(percent) || ![-1, 1].includes(direction)) return null;
  const r = Math.round(percent * 100) / 100;
  const next = direction > 0 ? (Math.floor(r / ZOOM_STEP + 1e-9) + 1) * ZOOM_STEP : (Math.ceil(r / ZOOM_STEP - 1e-9) - 1) * ZOOM_STEP;
  return clampPercent(next);
}
// Percentage that makes the whole page (or only its width) fit the viewport minus margin.
export function fitPercent({pageWidth, pageHeight, viewWidth, viewHeight, margin = PAGE_MARGIN, mode = 'page'}) {
  if (![pageWidth, pageHeight, viewWidth, viewHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const availW = Math.max(1, viewWidth - 2 * margin), availH = Math.max(1, viewHeight - 2 * margin);
  const pw = pageWidth / TWIPS_PER_PX, ph = pageHeight / TWIPS_PER_PX;
  const ratio = mode === 'width' ? availW / pw : Math.min(availW / pw, availH / ph);
  // Floor to 0.01% so rounding can never push the page outside the viewport.
  return clampPercent(Math.floor(ratio * 10000) / 100);
}

function axis(content, view, margin, pan) {
  const padded = content + 2 * margin;
  if (padded <= view) return {pan: 0, start: Math.round((view - content) / 2), max: 0};
  const max = padded - view, p = Math.max(0, Math.min(max, Number.isFinite(pan) ? pan : 0));
  return {pan: p, start: Math.round(margin - p), max};
}
// Layout of the visible part of the page. All "css" values are CSS pixels inside the viewport,
// "twips" are document units, bitmap sizes are device pixels (css * dpr).
export function layoutOfficeView({pageWidth, pageHeight, viewWidth, viewHeight, percent, panX = 0, panY = 0, dpr = 1, margin = PAGE_MARGIN}) {
  if (![pageWidth, pageHeight, viewWidth, viewHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const p = clampPercent(percent), ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 4) : 1;
  if (p === null) return null;
  const z = p / 100, contentW = pageWidth / TWIPS_PER_PX * z, contentH = pageHeight / TWIPS_PER_PX * z;
  const ax = axis(contentW, viewWidth, margin, panX), ay = axis(contentH, viewHeight, margin, panY);
  const left = Math.max(0, ax.start), top = Math.max(0, ay.start);
  const right = Math.min(viewWidth, Math.round(ax.start + contentW)), bottom = Math.min(viewHeight, Math.round(ay.start + contentH));
  const cssWidth = Math.max(1, right - left), cssHeight = Math.max(1, bottom - top);
  const twipsPerCss = TWIPS_PER_PX / z;
  const width = Math.max(1, Math.round(cssWidth * ratio)), height = Math.max(1, Math.round(cssHeight * ratio));
  return {
    percent: p, dpr: ratio, panX: ax.pan, panY: ay.pan, maxPanX: ax.max, maxPanY: ay.max,
    contentWidth: contentW, contentHeight: contentH, pageLeft: ax.start, pageTop: ay.start,
    cssLeft: left, cssTop: top, cssWidth, cssHeight, width, height,
    x: Math.max(0, Math.round((left - ax.start) * twipsPerCss)), y: Math.max(0, Math.round((top - ay.start) * twipsPerCss)),
    // When the page is fully visible on an axis, request exactly the page so rounding never crops or pads it.
    tileWidth: ax.start >= 0 && right >= ax.start + contentW - 1 ? Math.round(pageWidth) : Math.max(1, Math.round(cssWidth * twipsPerCss)),
    tileHeight: ay.start >= 0 && bottom >= ay.start + contentH - 1 ? Math.round(pageHeight) : Math.max(1, Math.round(cssHeight * twipsPerCss))
  };
}

// Split a large bitmap into requests that fit the client tile limits.
export function planSnapshotTiles(view, {maxWidth = SNAPSHOT_LIMITS.maxTileWidth, maxHeight = SNAPSHOT_LIMITS.maxTileHeight} = {}) {
  if (!view || !(view.width > 0) || !(view.height > 0)) return [];
  const tiles = [], tw = view.tileWidth / view.width, th = view.tileHeight / view.height;
  for (let sy = 0; sy < view.height; sy += maxHeight) {
    const h = Math.min(maxHeight, view.height - sy);
    for (let sx = 0; sx < view.width; sx += maxWidth) {
      const w = Math.min(maxWidth, view.width - sx);
      tiles.push({sx, sy, width: w, height: h, x: view.x + Math.round(sx * tw), y: view.y + Math.round(sy * th), tileWidth: Math.max(1, Math.round(w * tw)), tileHeight: Math.max(1, Math.round(h * th))});
    }
  }
  return tiles;
}

// Convert a pointer position to document twips. Returns null outside the canvas (page margin) unless clamp is set (drags).
export function canvasPointToDocument(point, rect, view, {clamp = false} = {}) {
  if (!point || !rect || !view || !(rect.width > 0) || !(rect.height > 0)) return null;
  let fx = (point.clientX - rect.left) / rect.width, fy = (point.clientY - rect.top) / rect.height;
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) {
    if (!clamp) return null;
    fx = Math.max(0, Math.min(1, fx)); fy = Math.max(0, Math.min(1, fy));
  }
  return {x: Math.max(0, Math.round(view.x + fx * view.tileWidth)), y: Math.max(0, Math.round(view.y + fy * view.tileHeight))};
}
// Document rectangle (twips) -> canvas bitmap pixels.
export function documentRectToBitmap(rect, view) {
  if (!rect || !view) return null;
  const sx = view.width / view.tileWidth, sy = view.height / view.tileHeight;
  return {x: (rect.x - view.x) * sx, y: (rect.y - view.y) * sy, width: rect.width * sx, height: rect.height * sy};
}
// Keep the document point under the anchor (viewport CSS px) fixed when zoom changes.
export function anchoredPan({pageWidth, pageHeight, viewWidth, viewHeight, oldPercent, newPercent, panX, panY, anchorX, anchorY, margin = PAGE_MARGIN}) {
  const before = layoutOfficeView({pageWidth, pageHeight, viewWidth, viewHeight, percent: oldPercent, panX, panY, margin});
  if (!before) return {panX: 0, panY: 0};
  const ax = Number.isFinite(anchorX) ? anchorX : viewWidth / 2, ay = Number.isFinite(anchorY) ? anchorY : viewHeight / 2;
  const docX = (ax - before.pageLeft) / (oldPercent / 100), docY = (ay - before.pageTop) / (oldPercent / 100);
  const z = newPercent / 100;
  return {panX: margin - (ax - docX * z), panY: margin - (ay - docY * z)};
}

// Snapshot response validation (main process). Returns the PNG size read from IHDR.
export function validateSnapshotPng(base64, claimed = {}) {
  const L = SNAPSHOT_LIMITS;
  if (typeof base64 !== 'string' || base64.length === 0 || base64.length % 4 || base64.length > Math.ceil(L.maxPngBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw Error('Office画面数据无效');
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (bytes.length > L.maxPngBytes) throw Error('Office画面超限');
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || sig.some((v, i) => bytes[i] !== v)) throw Error('Office画面不是PNG');
  const dv = new DataView(bytes.buffer), width = dv.getUint32(16), height = dv.getUint32(20);
  if (width < 1 || height < 1 || width > L.maxWidth || height > L.maxHeight) throw Error('Office画面尺寸超限');
  if (claimed.width !== undefined && (claimed.width !== width || claimed.height !== height)) throw Error('Office画面尺寸不一致');
  return {width, height, bytes: bytes.length};
}
