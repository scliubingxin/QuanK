/* [p4-m1] Trusted dashboard renderer. Receives only computed data (no code) from the host over postMessage,
   draws it with the bundled ECharts, sends filter changes and PNG exports back. No network, no storage. */
(() => {
  'use strict';
  const token = location.hash.slice(1);
  const COLORS = ['#0078CB', '#38A3C7', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444', '#425C85', '#EC4899', '#14B8A6', '#84CC16'];
  const app = document.getElementById('app'), status = document.getElementById('status');
  let charts = [], chartAt = {}, current = null, filters = {};
  const standalone = window.__WB_VIEW__ !== undefined || parent === window;
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v);
    for (const k of kids) if (k) e.append(k);
    return e;
  };
  const fmt = v => {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e8) return (v / 1e8).toFixed(2).replace(/\.?0+$/, '') + ' 亿';
    if (a >= 1e4) return (v / 1e4).toFixed(2).replace(/\.?0+$/, '') + ' 万';
    return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', {maximumFractionDigits: 2});
  };
  const send = msg => { if (!standalone) parent.postMessage({...msg, token}, '*'); };

  function option(c) {
    const base = {color: COLORS, animationDuration: 300, textStyle: {fontFamily: '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif'},
      tooltip: {trigger: c.type === 'pie' || c.type === 'scatter' ? 'item' : 'axis', valueFormatter: fmt, confine: true},
      grid: {left: 12, right: 18, top: c.series?.length > 1 ? 36 : 18, bottom: 8, containLabel: true},
      legend: c.series?.length > 1 && c.type !== 'pie' ? {type: 'scroll', top: 0} : undefined, toolbox: undefined};
    const axisLabel = {formatter: v => typeof v === 'number' ? fmt(v) : String(v).length > 12 ? String(v).slice(0, 12) + '…' : v, hideOverlap: true};
    if (c.type === 'pie') return {...base, legend: {type: 'scroll', orient: 'vertical', right: 0, top: 'middle'},
      series: [{type: 'pie', radius: ['42%', '70%'], center: ['40%', '52%'], avoidLabelOverlap: true, itemStyle: {borderColor: '#fff', borderWidth: 2},
        label: {formatter: '{b}\n{d}%'}, data: c.labels.map((l, i) => ({name: l, value: c.series[0].values[i]}))}]};
    if (c.type === 'scatter') return {...base, xAxis: {type: 'value', name: c.xName, scale: true, axisLabel}, yAxis: {type: 'value', name: c.yName, scale: true, axisLabel},
      series: [{type: 'scatter', symbolSize: 7, data: c.points}]};
    const horizontal = c.type === 'hbar';
    const cat = {type: 'category', data: c.labels, axisLabel, axisTick: {alignWithLabel: true}}, val = {type: 'value', axisLabel, splitLine: {lineStyle: {color: '#eef0f3'}}};
    return {...base, xAxis: horizontal ? val : cat, yAxis: horizontal ? cat : val,
      grid: {...base.grid, bottom: c.labels.length > 24 && !horizontal ? 40 : 8}, // [F1e] room for the date axis above the slider
      dataZoom: !horizontal && c.labels.length > 24 ? [{type: 'inside'}, {type: 'slider', height: 14, bottom: 4}] : undefined,
      series: c.series.map(s => ({name: s.name, type: c.type === 'line' ? 'line' : 'bar', data: s.values, smooth: c.type === 'line', showSymbol: c.labels.length <= 40,
        stack: c.type === 'stackedBar' ? 'total' : undefined, barMaxWidth: 36, areaStyle: c.type === 'line' && c.series.length === 1 ? {opacity: 0.08} : undefined,
        emphasis: {focus: 'series'}}))};
  }

  function filterBar(options) {
    if (!options?.length) return null;
    const bar = el('div', {class: 'filters'});
    for (const o of options) {
      const box = el('label', {class: 'filter'}, document.createTextNode(o.column));
      if (o.type === 'date') {
        const cur = filters[o.column] || {};
        const from = el('input', {type: 'date', value: cur.from || '', min: o.min || '', max: o.max || ''}), to = el('input', {type: 'date', value: cur.to || '', min: o.min || '', max: o.max || ''});
        const apply = () => { filters[o.column] = {from: from.value || '', to: to.value || ''}; send({kind: 'viz-filter', filters}); };
        from.addEventListener('change', apply); to.addEventListener('change', apply);
        box.append(el('span', {}, from, document.createTextNode(' 至 '), to));
      } else {
        const sel = el('select', {}), cur = (filters[o.column] || [])[0] || ''; // [ux10] one compact dropdown per filter
        sel.append(el('option', {value: '', text: `全部（${o.values.reduce((n, v) => n + v.count, 0)}）`}));
        for (const v of o.values) { const label = v.value.length > 24 ? v.value.slice(0, 24) + '…' : v.value; const op = el('option', {value: v.value, text: `${label}（${v.count}）`}); if (v.value === cur) op.selected = true; sel.append(op); }
        sel.addEventListener('change', () => { filters[o.column] = sel.value ? [sel.value] : []; send({kind: 'viz-filter', filters}); });
        box.append(sel);
      }
      bar.append(box);
    }
    const reset = el('button', {type: 'button', text: '清除筛选'});
    reset.addEventListener('click', () => { filters = {}; send({kind: 'viz-filter', filters}); });
    bar.append(reset);
    return bar;
  }

  function render(view, options) {
    for (const c of charts) c.dispose();
    charts = []; chartAt = {};
    current = view;
    app.replaceChildren();
    app.hidden = false; status.hidden = true; // [ux10] ECharts measures its container when created: it must be visible and attached
    app.append(el('header', {}, el('h1', {text: view.title}), view.description ? el('p', {text: view.description}) : null,
      el('div', {class: 'meta', text: view.rows === view.totalRows ? `共 ${view.totalRows} 行数据` : `筛选后 ${view.rows} 行 / 共 ${view.totalRows} 行`})));
    const bar = filterBar(options); if (bar) app.append(bar);
    if (view.kpis.length) app.append(el('div', {class: 'kpis'}, ...view.kpis.map(k => el('div', {class: 'kpi'}, el('small', {text: k.label}), el('b', {text: k.display})))));
    const grid = el('div', {class: 'grid'});
    app.append(grid);
    view.charts.forEach((c, i) => {
      const wide = c.type === 'table' || (c.type === 'line' && (c.labels?.length || 0) > 12) || view.charts.length === 1 || (i === view.charts.length - 1 && view.charts.length % 2 === 1 && c.type !== 'pie');
      const card = el('section', {class: 'card' + (wide ? ' wide' : '')}, el('h2', {text: c.title}));
      if (c.type === 'table') {
        const t = el('table', {}, el('thead', {}, el('tr', {}, ...c.columns.map(h => el('th', {text: h})))), el('tbody', {}, ...c.rows.map(r => el('tr', {}, ...r.map(v => el('td', {text: typeof v === 'number' ? fmt(v) : String(v ?? ''), title: String(v ?? '')}))))));
        card.append(el('div', {class: 'tablewrap'}, t));
        if (c.total > c.rows.length) card.append(el('div', {class: 'meta', text: `显示前 ${c.rows.length} 行，共 ${c.total} 行`}));
      } else if ((c.type === 'scatter' ? c.points.length : c.labels.length) === 0) card.append(el('div', {class: 'empty', text: '筛选后没有数据'}));
      else {
        const box = el('div', {class: 'chart'});
        card.append(box);
        grid.append(card);
        const chart = window.echarts.init(box, null, {renderer: 'canvas'});
        chart.setOption(option(c));
        charts.push(chart); chartAt[i] = chart;
        return;
      }
      grid.append(card);
    });
    requestAnimationFrame(() => charts.forEach(c => c.resize())); // [ux10]
    send({kind: 'viz-rendered', height: document.documentElement.scrollHeight});
  }

  /** One PNG of the whole page: header, KPI cards and every chart image laid out in the same grid. */
  function exportPng() {
    const W = 1600, pad = 32, gap = 20, colW = (W - pad * 2 - gap) / 2, chartH = 420, ratio = 2;
    const blocks = [], kpiH = current.kpis.length ? 96 : 0;
    let y = pad + 70 + (current.kpis.length ? kpiH + gap : 0), col = 0;
    current.charts.forEach((c, i) => {
      const wide = c.type === 'table' || c.type === 'line' && (c.labels?.length || 0) > 12 || current.charts.length === 1;
      if (wide && col === 1) { y += chartH + gap; col = 0; }
      blocks.push({c, i, x: pad + (wide ? 0 : col * (colW + gap)), y, w: wide ? W - pad * 2 : colW});
      if (wide || col === 1) { y += chartH + gap; col = 0; } else col = 1;
    });
    if (col === 1) y += chartH + gap;
    const canvas = document.createElement('canvas'); canvas.width = W * ratio; canvas.height = (y + pad) * ratio;
    const g = canvas.getContext('2d'); g.scale(ratio, ratio); g.fillStyle = '#fff'; g.fillRect(0, 0, W, y + pad);
    g.fillStyle = '#1f2937'; g.font = '600 28px -apple-system,"PingFang SC",sans-serif'; g.fillText(current.title, pad, pad + 30);
    g.fillStyle = '#6b7280'; g.font = '15px -apple-system,"PingFang SC",sans-serif'; g.fillText((current.description ? current.description + ' · ' : '') + `共 ${current.rows} 行数据`, pad, pad + 58);
    const kw = current.kpis.length ? (W - pad * 2 - gap * (current.kpis.length - 1)) / current.kpis.length : 0;
    current.kpis.forEach((k, i) => {
      const x = pad + i * (kw + gap), ky = pad + 76;
      g.fillStyle = '#f6f8fb'; g.strokeStyle = '#e5e7eb'; g.beginPath(); g.roundRect(x, ky, kw, kpiH, 12); g.fill(); g.stroke();
      g.fillStyle = '#6b7280'; g.font = '14px -apple-system,"PingFang SC",sans-serif'; g.fillText(k.label, x + 16, ky + 30);
      g.fillStyle = '#0078CB'; g.font = '600 28px -apple-system,"PingFang SC",sans-serif'; g.fillText(k.display, x + 16, ky + 70);
    });
    const draws = blocks.map(b => new Promise(resolve => {
      g.strokeStyle = '#e5e7eb'; g.beginPath(); g.roundRect(b.x, b.y, b.w, chartH, 12); g.stroke();
      g.fillStyle = '#1f2937'; g.font = '600 17px -apple-system,"PingFang SC",sans-serif'; g.fillText(b.c.title, b.x + 16, b.y + 28);
      if (b.c.type === 'table') {
        g.font = '13px -apple-system,"PingFang SC",sans-serif';
        const cw = (b.w - 32) / b.c.columns.length;
        b.c.columns.forEach((h, j) => { g.fillStyle = '#6b7280'; g.fillText(String(h).slice(0, 18), b.x + 16 + j * cw, b.y + 56); });
        b.c.rows.slice(0, 12).forEach((r, k) => r.forEach((v, j) => { g.fillStyle = '#1f2937'; g.fillText(String(typeof v === 'number' ? fmt(v) : v ?? '').slice(0, 20), b.x + 16 + j * cw, b.y + 84 + k * 26); }));
        return resolve();
      }
      const chart = chartAt[b.i];
      if (!chart) return resolve();
      const img = new Image();
      img.onload = () => { g.drawImage(img, b.x + 8, b.y + 40, b.w - 16, chartH - 52); resolve(); };
      img.onerror = () => resolve();
      img.src = chart.getDataURL({type: 'png', pixelRatio: 2, backgroundColor: '#fff'});
    }));
    Promise.all(draws).then(() => send({kind: 'viz-image', dataUrl: canvas.toDataURL('image/png')}));
  }

  addEventListener('message', e => {
    if (e.source !== parent || e.data?.token !== token) return;
    if (e.data.kind === 'viz-render') { filters = e.data.filters || {}; try { render(e.data.view, e.data.options); } catch (err) { status.hidden = false; status.textContent = '仪表盘渲染失败：' + err.message; } }
    else if (e.data.kind === 'viz-export' && current) exportPng();
  });
  addEventListener('resize', () => charts.forEach(c => c.resize()));
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => charts.forEach(c => c.resize())).observe(app); // [ux10] dialog opening / panel resize
  if (!window.echarts) { status.textContent = '图表组件加载失败'; send({kind: 'viz-error', message: '图表库没有加载'}); return; } // [ux8]
  if (window.__WB_VIEW__) { render(window.__WB_VIEW__, []); return; } // exported standalone page: static snapshot, no filters
  send({kind: 'viz-ready'});
})();
