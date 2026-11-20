// 版式：每个版式是纯函数 (slide, ctx) → shapes[]；溢出写入 ctx.overflow。所有几何均在此计算，渲染器只负责绘制。
import { GRID as G, TYPE, CARD, getTheme } from './themes.mjs';
import { fitParas, measureParas, commonSize, wrapLines, textEm, LINE_EM } from './measure.mjs';

export const mix = (a, b, t) => { const p = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
const BW = G.W - 2 * G.mx;
const shape = (o) => ({ kind: 'shape', shape: 'rect', ...o });
function tb(ctx, out, o) {
  const paras = o.paras || [{ text: o.text, bold: o.bold }];
  const f = fitParas(paras, o.w, o.h, { max: o.max, min: o.min ?? o.max, ls: o.ls ?? TYPE.ls, gap: o.gap ?? 0, indent: o.indent ?? 0 });
  if (!f.ok && !o.soft) ctx.overflow = true;
  out.push({ kind: 'text', x: o.x, y: o.y, w: o.w, h: o.h, paras: paras.map((p) => ({ ...p, color: p.color || o.color })), size: f.size, ls: f.ls, gap: f.gap, align: o.align || 'left', valign: o.valign || 'top', indent: o.indent ?? 0, role: o.role });
  return f;
}
const th = (ctx) => ctx.theme;
const pad2 = (n) => String(n).padStart(2, '0');

/** 页眉(章节标签+标题+副标题+分隔线+logo) 与页脚(品牌+页码)。返回正文区。 */
function frame(slide, ctx, out, { footer = true } = {}) {
  const t = th(ctx);
  out.push(shape({ shape: 'rect', x: 0, y: 0, w: G.W, h: G.H, fill: t.bg, role: 'bg' }));
  const tagged = !!slide.section;
  const tx = G.mx + (tagged ? G.tagSize + 0.2 : 0), logoX = G.W - G.mx - G.logoW;
  if (tagged) {
    out.push(shape({ shape: 'rect', x: G.mx, y: G.tagY, w: G.tagSize, h: G.tagSize, fill: t.primary }));
    tb(ctx, out, { x: G.mx, y: G.tagY, w: G.tagSize, h: G.tagSize, text: slide.section, max: 16, min: 11, bold: true, color: t.onPrimary, align: 'center', valign: 'middle', ls: 1.0, role: 'tag' });
  }
  tb(ctx, out, { x: tx, y: G.titleY, w: logoX - 0.2 - tx, h: G.titleH, text: slide.title, max: TYPE.title[0], min: 22, bold: true, color: t.text, valign: 'middle', ls: 1.0, role: 'title' });
  if (slide.subtitle) tb(ctx, out, { x: tx, y: G.subY, w: BW - (tx - G.mx), h: G.subH, text: slide.subtitle, max: TYPE.subtitle[0], min: TYPE.subtitle[1], color: t.muted, valign: 'top', ls: 1.0, role: 'subtitle' });
  out.push(shape({ shape: 'rect', x: G.mx, y: G.ruleY, w: BW, h: 0.012, fill: t.border, role: 'rule' }));
  out.push(shape({ shape: 'rect', x: G.mx, y: G.ruleY - 0.012, w: 1.1, h: 0.036, fill: t.primary, role: 'rule' }));
  logo(ctx, out, logoX, G.tagY - 0.02, 'light');
  if (footer) {
    tb(ctx, out, { x: G.mx, y: G.footY, w: 4, h: G.footH, text: ctx.brand.name, max: TYPE.footer, color: t.muted, valign: 'middle', ls: 1.0, role: 'footer' });
    if (ctx.pageNumbers) tb(ctx, out, { x: G.W - G.mx - 2, y: G.footY, w: 2, h: G.footH, text: `${ctx.page} / ${ctx.total}`, max: TYPE.footer, color: t.muted, align: 'right', valign: 'middle', ls: 1.0, role: 'page' });
  }
  return { x: G.mx, y: G.bodyY, w: BW, h: G.bodyB - G.bodyY };
}
function logo(ctx, out, x, y, mode) {
  if (ctx.brand.showLogo === false) return;
  const t = th(ctx), img = ctx.brand.logoImageId && ctx.images?.[ctx.brand.logoImageId];
  if (img) {
    const s = Math.min(G.logoW / img.width, G.logoH / img.height), w = img.width * s, h = img.height * s;
    out.push({ kind: 'image', imageId: ctx.brand.logoImageId, x: x + G.logoW - w, y: y + (G.logoH - h) / 2, w, h, role: 'logo' });
    return;
  }
  const c = mode === 'dark' ? t.onPrimary : t.primary;
  out.push(shape({ shape: 'roundRect', x: x + G.logoW - 2.0, y: y + 0.07, w: 0.36, h: 0.36, fill: mode === 'dark' ? t.accent : t.primary, radius: 0.07, role: 'logo' }));
  tb(ctx, out, { x: x + G.logoW - 2.0, y: y + 0.07, w: 0.36, h: 0.36, text: Array.from(ctx.brand.name)[0] || 'W', max: 14, bold: true, color: mode === 'dark' ? t.coverBg : t.onPrimary, align: 'center', valign: 'middle', ls: 1.0, role: 'logo' });
  tb(ctx, out, { x: x + G.logoW - 1.55, y, w: 1.55, h: G.logoH, text: ctx.brand.name, max: 15, min: 10, bold: true, color: c, valign: 'middle', ls: 1.0, role: 'logo' });
}
function takeaway(ctx, out, slide, body) {
  if (!slide.takeaway) return body;
  const t = th(ctx), h = 0.66, y = body.y + body.h - h;
  out.push(shape({ shape: 'roundRect', x: body.x, y, w: body.w, h, fill: t.light, radius: CARD.radius, role: 'takeaway' }));
  out.push(shape({ shape: 'rect', x: body.x, y: y + 0.1, w: 0.07, h: h - 0.2, fill: t.primary }));
  tb(ctx, out, { x: body.x + 0.3, y: y + 0.07, w: body.w - 0.5, h: h - 0.14, text: slide.takeaway, max: TYPE.body[0], min: TYPE.body[1], bold: true, color: t.primary, valign: 'middle', ls: 1.0, role: 'takeaway' });
  return { ...body, h: body.h - h - G.gap };
}
const card = (ctx, out, x, y, w, h, fill) => out.push(shape({ shape: 'roundRect', x, y, w, h, fill: fill || th(ctx).light, line: th(ctx).border, lineW: CARD.lineW, radius: CARD.radius, role: 'card' }));

/** 竖排卡片列：cards/process 共用。items:[{title,body}]；topOffset 为卡片顶部之上的装饰高度。 */
function columnCards(ctx, out, items, area, { badge = true, cols = items.length, fillH = false } = {}) {
  const t = th(ctx), n = items.length, g = G.gap, cw = (area.w - g * (cols - 1)) / cols, p = CARD.pad, iw = cw - 2 * p;
  const badgeH = badge ? 0.46 + 0.14 : 0;
  const ts = commonSize(items, (it, s) => wrapLines(it.title, s, iw, { bold: true }).length <= 2, { max: TYPE.cardTitle[0], min: TYPE.cardTitle[1] });
  const titleH = Math.max(...items.map((it) => measureParas([{ text: it.title, bold: true }], iw, { size: ts.size, ls: 1.0 }).h));
  const fixed = p + badgeH + titleH + (items.some((i) => i.body) ? 0.12 : 0) + p;
  const bodyAvail = area.h - fixed;
  const bs = commonSize(items, (it, s) => !it.body || measureParas([{ text: it.body }], iw, { size: s, ls: TYPE.ls }).h <= bodyAvail + 1e-6, { max: TYPE.body[0], min: TYPE.body[1] });
  if (!ts.ok || !bs.ok || bodyAvail < 0) ctx.overflow = true;
  const needBody = Math.max(0, ...items.map((it) => (it.body ? measureParas([{ text: it.body }], iw, { size: bs.size, ls: TYPE.ls }).h : 0)));
  const ch = fillH ? area.h : Math.min(area.h, Math.max(fixed + needBody + 0.1, Math.min(2.8, area.h)));
  const blockH = ch * Math.ceil(n / cols) + g * (Math.ceil(n / cols) - 1), oy = fillH ? 0 : Math.max(0, (area.h - blockH) * 0.35);
  items.forEach((it, i) => {
    const x = area.x + (i % cols) * (cw + g), y = area.y + oy + Math.floor(i / cols) * (ch + g), col = t.series[i % t.series.length];
    card(ctx, out, x, y, cw, ch);
    let cy = y + p;
    if (badge) {
      out.push(shape({ shape: 'ellipse', x: x + p, y: cy, w: 0.46, h: 0.46, fill: col, role: 'badge' }));
      tb(ctx, out, { x: x + p, y: cy, w: 0.46, h: 0.46, text: pad2(it.n ?? i + 1), max: 13, bold: true, color: '#FFFFFF'.slice(1), align: 'center', valign: 'middle', ls: 1.0, role: 'badge' });
      cy += 0.6;
    }
    tb(ctx, out, { x: x + p, y: cy, w: iw, h: titleH, text: it.title, max: ts.size, min: ts.size, bold: true, color: t.primary, ls: 1.0, role: 'cardTitle' });
    cy += titleH + 0.12;
    if (it.body) tb(ctx, out, { x: x + p, y: cy, w: iw, h: y + ch - p - cy, text: it.body, max: bs.size, min: bs.size, color: t.text, role: 'cardBody' });
  });
  return { h: ch * Math.ceil(n / cols) + g * (Math.ceil(n / cols) - 1), cardH: ch };
}

export const LAYOUT_FNS = {
  cover(s, ctx) {
    const t = th(ctx), out = [];
    out.push(shape({ shape: 'rect', x: 0, y: 0, w: G.W, h: G.H, fill: t.coverBg, role: 'bg' }));
    out.push(shape({ shape: 'rect', x: 9.7, y: 0, w: G.W - 9.7, h: G.H, fill: mix(t.coverBg, t.accent, 0.28), role: 'deco' }));
    t.series.forEach((c, i) => out.push(shape({ shape: 'rect', x: 10.6 + i * 0.5, y: 5.6 - i * 0.7, w: 0.42, h: 0.42 + i * 0.7, fill: c, role: 'deco' })));
    logo(ctx, out, 0.9 - (G.logoW - 2.0) - 0.0, 0.55, 'dark');
    out.push(shape({ shape: 'rect', x: 0.9, y: 2.1, w: 1.0, h: 0.07, fill: t.accent, role: 'deco' }));
    tb(ctx, out, { x: 0.9, y: 2.3, w: 8.4, h: 1.9, text: s.title, max: TYPE.coverTitle[0], min: TYPE.coverTitle[1], bold: true, color: t.onPrimary === '06202A' ? 'FFFFFF' : 'FFFFFF', valign: 'bottom', ls: 1.0, role: 'coverTitle' });
    if (s.subtitle) tb(ctx, out, { x: 0.9, y: 4.4, w: 8.4, h: 1.0, text: s.subtitle, max: 20, min: 14, color: t.onCoverMuted, ls: 1.1, role: 'coverSub' });
    if (s.meta) tb(ctx, out, { x: 0.9, y: 6.35, w: 8.4, h: 0.4, text: s.meta, max: 14, min: 11, color: t.onCoverMuted, valign: 'middle', ls: 1.0, role: 'meta' });
    return out;
  },
  section(s, ctx) {
    const t = th(ctx), out = [];
    out.push(shape({ shape: 'rect', x: 0, y: 0, w: G.W, h: G.H, fill: t.coverBg, role: 'bg' }));
    out.push(shape({ shape: 'rect', x: 10.2, y: 0, w: G.W - 10.2, h: G.H, fill: mix(t.coverBg, t.accent, 0.22), role: 'deco' }));
    tb(ctx, out, { x: 0.9, y: 1.7, w: 5, h: 1.5, text: s.number || '01', max: 80, bold: true, color: t.accent, valign: 'bottom', ls: 1.0, role: 'sectionNo' });
    out.push(shape({ shape: 'rect', x: 0.9, y: 3.4, w: 1.0, h: 0.07, fill: t.accent, role: 'deco' }));
    tb(ctx, out, { x: 0.9, y: 3.6, w: 8.8, h: 1.3, text: s.title, max: TYPE.sectionTitle[0], min: TYPE.sectionTitle[1], bold: true, color: 'FFFFFF', ls: 1.0, role: 'sectionTitle' });
    if (s.subtitle) tb(ctx, out, { x: 0.9, y: 5.0, w: 8.8, h: 0.9, text: s.subtitle, max: 18, min: 14, color: t.onCoverMuted, ls: 1.1, role: 'sectionSub' });
    logo(ctx, out, G.W - G.mx - G.logoW, 0.55, 'dark');
    return out;
  },
  closing(s, ctx) {
    const t = th(ctx), out = [];
    out.push(shape({ shape: 'rect', x: 0, y: 0, w: G.W, h: G.H, fill: t.coverBg, role: 'bg' }));
    out.push(shape({ shape: 'rect', x: 9.7, y: 0, w: G.W - 9.7, h: G.H, fill: mix(t.coverBg, t.accent, 0.28), role: 'deco' }));
    logo(ctx, out, 0.9 - (G.logoW - 2.0), 0.55, 'dark');
    out.push(shape({ shape: 'rect', x: 0.9, y: 2.6, w: 1.0, h: 0.07, fill: t.accent, role: 'deco' }));
    tb(ctx, out, { x: 0.9, y: 2.8, w: 8.4, h: 1.5, text: s.title || '谢谢', max: 54, min: 32, bold: true, color: 'FFFFFF', valign: 'middle', ls: 1.0, role: 'coverTitle' });
    if (s.subtitle) tb(ctx, out, { x: 0.9, y: 4.4, w: 8.4, h: 0.9, text: s.subtitle, max: 20, min: 14, color: t.onCoverMuted, ls: 1.1, role: 'coverSub' });
    if (s.contact) tb(ctx, out, { x: 0.9, y: 6.0, w: 8.4, h: 0.6, text: s.contact, max: 14, min: 11, color: t.onCoverMuted, valign: 'middle', ls: 1.0, role: 'meta' });
    return out;
  },
  toc(s, ctx) {
    const t = th(ctx), out = [], body = frame(s, ctx, out), n = s.items.length, cols = n > 4 ? 2 : 1, rows = Math.ceil(n / cols), g = 0.2;
    const w = (body.w - g * (cols - 1)) / cols, h = Math.min(1.0, (body.h - g * (rows - 1)) / rows), top = body.y;
    s.items.forEach((it, i) => {
      const x = body.x + (i % cols) * (w + g), y = top + Math.floor(i / cols) * (h + g);
      card(ctx, out, x, y, w, h);
      out.push(shape({ shape: 'rect', x: x + 0.2, y: y + (h - 0.56) / 2, w: 0.56, h: 0.56, fill: t.series[i % 4], role: 'badge' }));
      tb(ctx, out, { x: x + 0.2, y: y + (h - 0.56) / 2, w: 0.56, h: 0.56, text: pad2(it.n ?? i + 1), max: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', ls: 1.0, role: 'badge' });
      const tw = w - 1.1;
      if (it.desc) {
        tb(ctx, out, { x: x + 0.95, y: y + 0.1, w: tw, h: h * 0.5 - 0.1, text: it.title, max: 18, min: 14, bold: true, color: t.text, valign: 'bottom', ls: 1.0, role: 'cardTitle' });
        tb(ctx, out, { x: x + 0.95, y: y + h * 0.5 + 0.02, w: tw, h: h * 0.5 - 0.1, text: it.desc, max: 13, min: 11, color: t.muted, ls: 1.0, role: 'cardBody' });
      } else tb(ctx, out, { x: x + 0.95, y: y + 0.08, w: tw, h: h - 0.16, text: it.title, max: 18, min: 14, bold: true, color: t.text, valign: 'middle', ls: 1.0, role: 'cardTitle' });
    });
    return out;
  },
  process(s, ctx) {
    const t = th(ctx), out = [], f = frame(s, ctx, out), area = takeaway(ctx, out, s, f), n = s.steps.length, g = G.gap, cw = (area.w - g * (n - 1)) / n, chH = 0.62;
    s.steps.forEach((st, i) => {
      const x = area.x + i * (cw + g);
      out.push(shape({ shape: i === 0 ? 'homePlate' : 'chevron', x: x - (i ? g * 0.6 : 0), y: area.y, w: cw + g * (i < n - 1 ? 0.6 : 0) + (i ? g * 0.6 : 0), h: chH, fill: t.series[i % 4], role: 'chevron' }));
      tb(ctx, out, { x: x + 0.1, y: area.y, w: cw - 0.2, h: chH, text: `STEP ${pad2(i + 1)}`, max: 13, min: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', ls: 1.0, role: 'chevronText' });
    });
    columnCards(ctx, out, s.steps.map((x, i) => ({ ...x, n: i + 1 })), { x: area.x, y: area.y + chH + 0.2, w: area.w, h: area.h - chH - 0.2 }, { badge: false });
    return out;
  },
  timeline(s, ctx) {
    const t = th(ctx), out = [], f = frame(s, ctx, out), area = takeaway(ctx, out, s, f), n = s.events.length, cw = area.w / n, pd = 0.16, iw = cw - 0.2 - 2 * pd;
    const dateH = 0.4, rest = dateH + 0.1 + 0.42;
    const avail = area.h - rest - 2 * pd;
    const ts = commonSize(s.events, (e, z) => wrapLines(e.title, z, iw, { bold: true }).length <= 3, { max: 15, min: 12 });
    const titleH = Math.max(...s.events.map((e) => measureParas([{ text: e.title, bold: true }], iw, { size: ts.size, ls: 1.0 }).h));
    const bs = commonSize(s.events, (e, z) => !e.body || measureParas([{ text: e.body }], iw, { size: z, ls: TYPE.ls }).h <= avail - titleH - 0.1, { max: 14, min: 11 });
    if (!ts.ok || !bs.ok) ctx.overflow = true;
    const bodyH = Math.max(0, ...s.events.map((e) => (e.body ? measureParas([{ text: e.body }], iw, { size: bs.size, ls: TYPE.ls }).h : 0)));
    const cardH = Math.max(2.2, titleH + 0.1 + bodyH + 2 * pd), oy = Math.max(0, (area.h - rest - cardH) * 0.3), y0 = area.y + oy, lineY = y0 + dateH + 0.1, cardY = lineY + 0.42;
    out.push(shape({ shape: 'rect', x: area.x, y: lineY - 0.015, w: area.w, h: 0.03, fill: t.border, role: 'axis' }));
    s.events.forEach((e, i) => {
      const x = area.x + i * cw, col = t.series[i % 4];
      tb(ctx, out, { x: x + 0.1, y: y0, w: cw - 0.2, h: dateH, text: e.date, max: 15, min: 11, bold: true, color: col, valign: 'bottom', ls: 1.0, role: 'date' });
      out.push(shape({ shape: 'ellipse', x: x + 0.1, y: lineY - 0.11, w: 0.22, h: 0.22, fill: col, line: t.bg, lineW: 2, role: 'dot' }));
      card(ctx, out, x + 0.1, cardY, cw - 0.2, cardH);
      tb(ctx, out, { x: x + 0.1 + pd, y: cardY + pd, w: iw, h: titleH, text: e.title, max: ts.size, bold: true, color: t.text, ls: 1.0, role: 'cardTitle' });
      if (e.body) tb(ctx, out, { x: x + 0.1 + pd, y: cardY + pd + titleH + 0.1, w: iw, h: cardH - 2 * pd - titleH - 0.1, text: e.body, max: bs.size, color: t.muted, role: 'cardBody' });
    });
    return out;
  },
  kpi(s, ctx) {
    const t = th(ctx), out = [], f = frame(s, ctx, out), n = s.kpis.length, g = G.gap, cw = (f.w - g * (n - 1)) / n, p = CARD.pad, iw = cw - 2 * p;
    const hasPts = !!s.points?.length, ptsH = hasPts ? Math.min(2.2, 0.5 + s.points.length * 0.42) : 0, ch = f.h - (hasPts ? ptsH + g : 0), cardH = Math.min(ch, hasPts ? 2.6 : 3.8);
    const vs = commonSize(s.kpis, (k, z) => textEm(k.value, true) * z / 72 <= iw, { max: TYPE.kpi[0], min: TYPE.kpi[1], step: 1 });
    if (!vs.ok) ctx.overflow = true;
    const vH = vs.size / 72 * LINE_EM + 0.05;
    const lh = 0.42, noteTop = f.y + p + vH + lh + 0.1;
    const ns = commonSize(s.kpis, (k, z) => !k.note || measureParas([{ text: k.note }], iw, { size: z, ls: TYPE.ls }).h <= f.y + cardH - p - noteTop, { max: 13, min: 11 });
    if (!ns.ok) ctx.overflow = true;
    s.kpis.forEach((k, i) => {
      const x = f.x + i * (cw + g), col = t.series[i % 4];
      card(ctx, out, x, f.y, cw, cardH);
      out.push(shape({ shape: 'rect', x: x + p, y: f.y + 0.001, w: 0.6, h: 0.06, fill: col, role: 'deco' }));
      tb(ctx, out, { x: x + p, y: f.y + p, w: iw, h: vH, text: k.value, max: vs.size, bold: true, color: col, valign: 'middle', ls: 1.0, role: 'kpiValue' });
      tb(ctx, out, { x: x + p, y: f.y + p + vH, w: iw, h: lh, text: k.label, max: 15, min: 12, bold: true, color: t.text, ls: 1.0, role: 'cardTitle' });
      if (k.note) tb(ctx, out, { x: x + p, y: noteTop, w: iw, h: f.y + cardH - p - noteTop, text: k.note, max: ns.size, color: t.muted, role: 'cardBody' });
    });
    if (hasPts) {
      const y = f.y + cardH + g, h = f.h - cardH - g;
      card(ctx, out, f.x, y, f.w, h, t.bg);
      out.push(shape({ shape: 'rect', x: f.x, y: y + 0.12, w: 0.07, h: h - 0.24, fill: t.primary }));
      tb(ctx, out, { x: f.x + 0.35, y: y + 0.12, w: f.w - 0.6, h: h - 0.24, paras: s.points.map((x) => ({ text: x, bullet: true })), max: 15, min: 11, gap: 6, indent: 0.25, color: t.text, valign: 'middle', role: 'points' });
    }
    return out;
  },
  'image-text'(s, ctx) {
    const t = th(ctx), out = [], f = frame(s, ctx, out), lw = 6.3, gx = 0.45, rx = f.x + lw + gx, rw = f.w - lw - gx, capH = s.caption ? 0.4 : 0;
    tb(ctx, out, { x: f.x, y: f.y, w: lw, h: f.h, paras: s.points.map((x) => ({ text: x, bullet: true })), max: 16, min: 11, gap: 12, indent: 0.25, color: t.text, valign: 'top', role: 'points' });
    const ih = f.h - capH - (capH ? 0.1 : 0), img = s.imageId && ctx.images?.[s.imageId];
    out.push(shape({ shape: 'roundRect', x: rx, y: f.y, w: rw, h: ih, fill: t.light, line: t.border, lineW: CARD.lineW, radius: CARD.radius, role: 'imageFrame', dash: img ? undefined : 'dash' }));
    if (img) { const sc = Math.min((rw - 0.2) / img.width, (ih - 0.2) / img.height), w = img.width * sc, h = img.height * sc; out.push({ kind: 'image', imageId: s.imageId, x: rx + (rw - w) / 2, y: f.y + (ih - h) / 2, w, h, role: 'image' }); }
    else tb(ctx, out, { x: rx + 0.3, y: f.y + ih / 2 - 0.3, w: rw - 0.6, h: 0.6, text: '在此插入图片 / 图表', max: 14, color: t.muted, align: 'center', valign: 'middle', ls: 1.0, role: 'placeholder' });
    if (capH) tb(ctx, out, { x: rx, y: f.y + ih + 0.1, w: rw, h: capH - 0.1 + 0.1, text: s.caption, max: 12, min: 11, color: t.muted, align: 'center', valign: 'middle', ls: 1.0, role: 'caption' });
    return out;
  },
  'compare-table'(s, ctx) {
    const t = th(ctx), out = [], f = frame(s, ctx, out), area = takeaway(ctx, out, s, f), rows = s.table, nc = rows[0].length;
    const em = (c) => textEm(c, false);
    const weights = rows[0].map((_, c) => { const col = rows.map((r) => em(r[c])), mx = Math.max(...col), av = col.reduce((a, b) => a + b, 0) / col.length; return Math.min(22, Math.max(5, 0.5 * mx + 0.5 * av)); });
    let colW = weights.map((w) => (w / weights.reduce((a, b) => a + b, 0)) * area.w);
    const minW = 1.3; let deficit = 0; colW = colW.map((w) => { if (w < minW) { deficit += minW - w; return minW; } return w; });
    const big = colW.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]); for (const [w, i] of big) { if (!deficit) break; const take = Math.min(deficit, w - minW); colW[i] -= take; deficit -= take; }
    const hc = s.highlightCol, padX = 0.12, padY = 0.08;
    const rowH = (size, r, bold) => Math.max(0.46, Math.max(...r.map((c, ci) => wrapLines(c, size, colW[ci] - 2 * padX, { bold: bold || ci === 0 }).length)) * size / 72 * LINE_EM * 1.0 + 2 * padY);
    let size = TYPE.body[0], hs;
    const total = (z) => rows.reduce((a, r, i) => a + rowH(z, r, i === 0), 0);
    const maxTotal = area.h;
    for (size = 14; size > 11 && total(size) > maxTotal; size -= 0.5);
    hs = rows.map((r, i) => rowH(size, r, i === 0));
    if (total(size) > maxTotal + 1e-6) ctx.overflow = true;
    const spare = Math.max(0, maxTotal - hs.reduce((a, b) => a + b, 0)), grow = Math.min(0.2, spare / rows.length); hs = hs.map((h) => h + grow);
    const cells = rows.map((r, ri) => r.map((c, ci) => {
      const head = ri === 0, lab = ci === 0, hot = hc === ci;
      return { text: c, bold: head || lab, size, color: head ? (hot ? t.onPrimary : lab ? t.primary : t.muted) : lab ? t.primary : t.text, fill: head ? (hot ? t.primary : t.light) : lab ? t.light : hot ? mix(t.light, t.bg, 0.4) : mix(t.bg, t.light, 0.25), align: 'left' };
    }));
    out.push({ kind: 'table', x: area.x, y: area.y, w: area.w, colW, rowH: hs, rows: cells, padX, padY, border: t.bg, role: 'table' });
    return out;
  },
  architecture(s, ctx) {
    const t = th(ctx), out = [], f = frame(s, ctx, out), area = takeaway(ctx, out, s, f), n = s.layers.length, g = 0.16, labW = 2.0;
    const rowH = Math.min(1.45, (area.h - g * (n - 1)) / n), areaW = area.w - labW - 0.12, pad = 0.14, gc = 0.14;
    const plan = (size) => s.layers.map((L) => {
      for (const r of [1, 2, 3]) {
        const m = L.items.length, k = Math.ceil(m / r), cwid = (areaW - 2 * pad - (k - 1) * gc) / k, ch = (rowH - 2 * pad - (r - 1) * gc) / r;
        if (ch >= 0.36 && L.items.every((it) => measureParas([{ text: it, bold: true }], cwid - 0.16, { size, ls: 1.0 }).h <= ch - 0.06 + 1e-6)) return { r, k, cwid, ch };
      } return null;
    });
    let size = 14, pl; for (; size >= 11; size -= 0.5) { pl = plan(size); if (pl.every(Boolean)) break; }
    if (size < 11) { size = 11; pl = plan(11); }
    if (!pl.every(Boolean)) { ctx.overflow = true; pl = s.layers.map((L) => { const k = L.items.length; return { r: 1, k, cwid: (areaW - 2 * pad - (k - 1) * gc) / k, ch: rowH - 2 * pad }; }); }
    const top = area.y + (area.h - (rowH * n + g * (n - 1))) / 2 * 0; // 顶部对齐
    s.layers.forEach((L, i) => {
      const y = top + i * (rowH + g), col = t.series[i % 4], p = pl[i];
      out.push(shape({ shape: 'roundRect', x: area.x, y, w: labW, h: rowH, fill: col, radius: CARD.radius, role: 'layerLabel' }));
      tb(ctx, out, { x: area.x + 0.1, y: y + 0.06, w: labW - 0.2, h: rowH - 0.12, text: L.name, max: 16, min: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', ls: 1.0, role: 'layerName' });
      card(ctx, out, area.x + labW + 0.12, y, areaW, rowH);
      L.items.forEach((it, j) => {
        const rr = Math.floor(j / p.k), cc = j % p.k, rowsIn = Math.ceil(L.items.length / p.k), used = p.k, cnt = rr === rowsIn - 1 ? L.items.length - rr * p.k : p.k;
        const w = p.cwid, x0 = area.x + labW + 0.12 + pad + (rr === rowsIn - 1 && cnt < used ? 0 : 0) + cc * (w + gc), y0 = y + pad + rr * (p.ch + gc);
        out.push(shape({ shape: 'roundRect', x: x0, y: y0, w, h: p.ch, fill: t.bg, line: mix(col, t.bg, 0.5), lineW: 1, radius: 0.07, role: 'chip' }));
        tb(ctx, out, { x: x0 + 0.08, y: y0 + 0.03, w: w - 0.16, h: p.ch - 0.06, text: it, max: size, min: size, bold: true, color: t.text, align: 'center', valign: 'middle', ls: 1.0, role: 'chipText' });
      });
    });
    return out;
  },
  matrix(s, ctx) {
    const t = th(ctx), out = [], f = frame(s, ctx, out), area = takeaway(ctx, out, s, f), g = 0.2, lab = 0.36;
    tb(ctx, out, { x: area.x, y: area.y, w: area.w / 2, h: lab, text: `↑ ${s.axes.y}`, max: 13, min: 11, bold: true, color: t.muted, valign: 'middle', ls: 1.0, role: 'axis' });
    tb(ctx, out, { x: area.x + area.w / 2, y: area.y + area.h - lab, w: area.w / 2, h: lab, text: `${s.axes.x} →`, max: 13, min: 11, bold: true, color: t.muted, align: 'right', valign: 'middle', ls: 1.0, role: 'axis' });
    const gy = area.y + lab + 0.04, gh = area.h - 2 * lab - 0.08, w = (area.w - g) / 2, h = (gh - g) / 2, p = CARD.pad, iw = w - 2 * p;
    const ts = commonSize(s.quadrants, (q, z) => wrapLines(q.title, z, iw, { bold: true }).length <= 1, { max: 17, min: 12 });
    const tH = ts.size / 72 * LINE_EM + 0.04;
    const bs = commonSize(s.quadrants, (q, z) => !q.body || measureParas([{ text: q.body }], iw, { size: z, ls: TYPE.ls }).h <= h - 2 * p - tH - 0.1, { max: 14, min: 11 });
    if (!ts.ok || !bs.ok) ctx.overflow = true;
    // 视觉顺序：左上=高Y低X … 按输入顺序 1 左上 2 右上 3 左下 4 右下
    s.quadrants.forEach((q, i) => {
      const x = area.x + (i % 2) * (w + g), y = gy + Math.floor(i / 2) * (h + g), col = t.series[i % 4];
      out.push(shape({ shape: 'roundRect', x, y, w, h, fill: mix(t.bg, col, t.dark ? 0.16 : 0.09), line: mix(t.bg, col, 0.35), lineW: CARD.lineW, radius: CARD.radius, role: 'card' }));
      out.push(shape({ shape: 'rect', x: x + p, y: y + p + 0.05, w: 0.07, h: tH - 0.1, fill: col, role: 'deco' }));
      tb(ctx, out, { x: x + p + 0.17, y: y + p, w: iw - 0.17, h: tH, text: q.title, max: ts.size, bold: true, color: col, valign: 'middle', ls: 1.0, role: 'cardTitle' });
      if (q.body) tb(ctx, out, { x: x + p, y: y + p + tH + 0.1, w: iw, h: h - 2 * p - tH - 0.1, text: q.body, max: bs.size, color: t.text, role: 'cardBody' });
    });
    return out;
  },
  summary(s, ctx) {
    const t = th(ctx), out = [], f = frame(s, ctx, out), area = takeaway(ctx, out, s, f), n = s.points.length, g = 0.16, p = CARD.pad;
    const rowH = Math.min(1.1, (area.h - g * (n - 1)) / n), tw = area.w - 0.2 - 0.62 - p - 0.2;
    const items = s.points.map((x) => (typeof x === 'string' ? { title: x } : x));
    const solo = items.filter((i) => !i.body);
    const ts = commonSize(items, (it, z) => (it.body ? wrapLines(it.title, z, tw, { bold: true }).length <= 1 : measureParas([{ text: it.title, bold: true }], tw, { size: z, ls: 1.0 }).h <= rowH - 0.2), { max: 17, min: 12 });
    const tH = ts.size / 72 * LINE_EM + 0.04;
    const bs = commonSize(items, (it, z) => !it.body || measureParas([{ text: it.body }], tw, { size: z, ls: 1.0 }).h <= rowH - 0.2 - tH, { max: 14, min: 11 });
    if (!ts.ok || !bs.ok) ctx.overflow = true;
    items.forEach((it, i) => {
      const y = area.y + i * (rowH + g), col = t.series[i % 4];
      card(ctx, out, area.x, y, area.w, rowH);
      out.push(shape({ shape: 'rect', x: area.x + 0.2, y: y + (rowH - 0.5) / 2, w: 0.5, h: 0.5, fill: col, role: 'badge' }));
      tb(ctx, out, { x: area.x + 0.2, y: y + (rowH - 0.5) / 2, w: 0.5, h: 0.5, text: pad2(it.n ?? i + 1), max: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', ls: 1.0, role: 'badge' });
      const x = area.x + 0.95;
      if (it.body) {
        tb(ctx, out, { x, y: y + 0.1, w: tw, h: tH, text: it.title, max: ts.size, bold: true, color: t.primary, valign: 'middle', ls: 1.0, role: 'cardTitle' });
        tb(ctx, out, { x, y: y + 0.1 + tH, w: tw, h: rowH - 0.2 - tH, text: it.body, max: bs.size, color: t.text, ls: 1.0, role: 'cardBody' });
      } else tb(ctx, out, { x, y: y + 0.1, w: tw, h: rowH - 0.2, text: it.title, max: ts.size, bold: true, color: t.text, valign: 'middle', ls: 1.0, role: 'cardTitle' });
    });
    return out;
  },
};
LAYOUT_FNS.cards = function cards(s, ctx) {
  const out = [], f = frame(s, ctx, out), area = takeaway(ctx, out, s, f);
  columnCards(ctx, out, s.cards, area, { badge: true });
  return out;
};
export const layoutSlide = (slide, ctx) => { ctx.overflow = false; const shapes = LAYOUT_FNS[slide.layout](slide, ctx); return { shapes, overflow: ctx.overflow, notes: slide.notes }; };
