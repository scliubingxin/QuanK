const words = new Intl.Segmenter('zh', { granularity: 'word' });
const tokenize = text => text.split(/([一二三四五六七八九十〇零\d]{1,3}月份?(?:是|为))/u)
  .flatMap((part, index) => index % 2 ? [part] : Array.from(words.segment(part), ({ segment }) => segment));

export function diffOfficeWords(original, replacement) {
  const left = tokenize(original), right = tokenize(replacement);
  const result = [];
  function add(type, text) {
    if (!text) return;
    const last = result.at(-1);
    if (last?.type === type) last.text += text;
    else result.push({ type, text });
  }
  let start = 0, endLeft = left.length, endRight = right.length;
  while (start < endLeft && start < endRight && left[start] === right[start]) start++;
  while (endLeft > start && endRight > start && left[endLeft - 1] === right[endRight - 1]) {
    endLeft--;
    endRight--;
  }
  add('equal', left.slice(0, start).join(''));
  const before = left.slice(start, endLeft), after = right.slice(start, endRight);
  const width = after.length + 1;
  // Bound memory and work when the model rewrites most of a large selection.
  if ((before.length + 1) * width > 2_000_000) {
    add('delete', before.join(''));
    add('insert', after.join(''));
  } else {
    const lengths = new Uint32Array((before.length + 1) * width);
    for (let i = before.length - 1; i >= 0; i--) {
      for (let j = after.length - 1; j >= 0; j--) {
        const index = i * width + j;
        lengths[index] = before[i] === after[j] ? lengths[index + width + 1] + 1 :
          Math.max(lengths[index + width], lengths[index + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < before.length || j < after.length) {
      if (i < before.length && j < after.length && before[i] === after[j]) {
        add('equal', before[i++]); j++;
      } else if (i < before.length && (j === after.length || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) {
        add('delete', before[i++]);
      } else add('insert', after[j++]);
    }
  }
  add('equal', left.slice(endLeft).join(''));
  return result;
}

export function selectionChanged() {
  return Object.assign(Error('选区已变化，请重新选择'), { code: 'selection_changed' });
}

function checkWrite(receipt) {
  if (receipt?.ok !== false) return;
  if (receipt.reason === 'selection_changed') throw selectionChanged();
  throw Error('写入失败，请重试。');
}

export async function applyOfficeAIResult(session, result, { keep = session.kind === 'writer', original, token = session.selection?.token } = {}) {
  if (session.readOnly) throw Error('当前文档为只读。');
  if (token == null || session.selection?.token !== token) throw selectionChanged();
  let receipt;
  if (result.type === 'table') {
    receipt = await session.uno('.uno:InsertTable', { rows: result.rows });
  } else if (result.type === 'chart') {
    receipt = await session.uno('.uno:InsertObjectChart', { chart: result.chart });
  } else if (result.type === 'text') {
    receipt = await session.replaceSelection(result.text, { track: true, token, ...(!keep && {accept:true}) });
    checkWrite(receipt);
    if (receipt?.ok !== true) throw Error('编辑器未确认写入。');
    if (!keep) return {changeSet:{...receipt.changeset, undo:() => session.undo()}};
  } else throw Error('此结果仅供查看或复制。');
  checkWrite(receipt);
  const changeSet = receipt?.changeset ?? (session.kind === 'writer' ? undefined :
    { before: original, after: result, undo: () => session.undo() });
  return { changeSet };
}

export function officeAIElement(doc, tag, text, className) {
  const element = doc.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

const darkPalette = '--qk-ai-fg:#eef2fa;--qk-ai-bg:#212633;--qk-ai-border:#475168;--qk-ai-fill:#303949;--qk-ai-add:#a7edc3;--qk-ai-del:#ffb4ba;--qk-ai-add-bg:#244b39;--qk-ai-del-bg:#522e3a;color-scheme:dark';

const styles = [
  '.qk-office-ai-surface{position:fixed;z-index:10020;box-sizing:border-box;color:var(--qk-ai-fg,#202938);background:var(--qk-ai-bg,#fff);border:1px solid var(--qk-ai-border,#dce2ea);border-radius:12px;box-shadow:0 12px 42px #18264325;font:14px/1.55 system-ui,sans-serif;text-align:left}',
  ':is([data-theme=dark],.dark) .qk-office-ai-surface{' + darkPalette + '}',
  '@media(prefers-color-scheme:dark){.qk-office-ai-surface{' + darkPalette + '}}',
  '.qk-office-ai-surface button,.qk-office-ai-trigger{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--qk-ai-border,#dce2ea);border-radius:7px;background:transparent;padding:5px 10px}',
  '.qk-office-ai-surface button:hover{background:var(--qk-ai-fill,#eef3fb)}',
  '.qk-office-ai-surface button:disabled{opacity:.5;cursor:default}',
  '.qk-office-ai-menu{width:min(244px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;padding:8px}',
  '.qk-office-ai-menu button{width:100%;text-align:left;border:0;display:block}',
  '.qk-office-ai-menu .qk-office-ai-menu-row{display:grid;grid-template-columns:20px minmax(0,1fr) 12px;align-items:center;gap:8px;padding:5px 10px;border-radius:7px;line-height:inherit}',
  '.qk-office-ai-menu summary{list-style:none;cursor:pointer}.qk-office-ai-menu summary::-webkit-details-marker{display:none}.qk-office-ai-menu summary:hover{background:var(--qk-ai-fill,#eef3fb)}',
  '.qk-office-ai-menu details button{padding-left:38px}.qk-office-ai-glyph,.qk-office-ai-chevron{text-align:center}.qk-office-ai-chevron{font-size:18px;line-height:1}.qk-office-ai-menu details[open] .qk-office-ai-chevron{transform:rotate(90deg)}',
  '.qk-office-ai-surface input,.qk-office-ai-surface textarea,.qk-office-ai-surface select{box-sizing:border-box;font:inherit;color:inherit;background:var(--qk-ai-bg,#fff);border:1px solid var(--qk-ai-border,#dce2ea);border-radius:6px;padding:6px}',
  '.qk-office-ai-menu form input,.qk-office-ai-result textarea{width:100%}.qk-office-ai-menu form{margin-top:6px}',
  '.qk-office-ai-result{width:min(510px,calc(100vw - 16px));max-height:calc(100vh - 16px);display:flex;flex-direction:column}',
  '.qk-office-ai-result header{padding:10px 14px;border-bottom:1px solid var(--qk-ai-border,#dce2ea);cursor:move;touch-action:none;font-weight:650}',
  '.qk-office-ai-content{padding:12px 14px;overflow:auto;max-height:45vh;white-space:pre-wrap;overflow-wrap:anywhere}',
  '.qk-office-ai-content ins{color:var(--qk-ai-add,#166534);background:var(--qk-ai-add-bg,#e1f7e9);text-decoration:none}',
  '.qk-office-ai-content del{color:var(--qk-ai-del,#a6223c);background:var(--qk-ai-del-bg,#fee9ec);text-decoration:line-through}',
  '.qk-office-ai-result footer{padding:9px 14px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;border-top:1px solid var(--qk-ai-border,#dce2ea)}',
  '.qk-office-ai-revision{display:grid;gap:2px;margin-right:auto}.qk-office-ai-revision select{padding:3px 5px;font-size:12px}.qk-office-ai-revision small{font-size:11px;opacity:.78}',
  '.qk-office-ai-result button.qk-office-ai-primary{background:#2F62F5;border-color:#2F62F5;color:#fff;font-weight:650}.qk-office-ai-result button.qk-office-ai-primary:hover:not(:disabled){background:#2453df;border-color:#2453df}',
  '.qk-office-ai-result button.qk-office-ai-reject{border-color:var(--qk-ai-border,#aab3c1)}.qk-office-ai-result button.qk-office-ai-reject:hover:not(:disabled){color:var(--qk-ai-del,#b42335)}',
  '.qk-office-ai-result table{border-collapse:collapse;width:100%}.qk-office-ai-result th,.qk-office-ai-result td{padding:6px 9px;border:1px solid var(--qk-ai-border,#dce2ea)}',
  '.qk-office-ai-result canvas{display:block;width:100%;height:auto}.qk-office-ai-result textarea{min-height:100px}',
].join('\n');

export function ensureOfficeAIStyles(doc) {
  if (doc.getElementById('qk-office-ai-styles')) return;
  const node = officeAIElement(doc, 'style', styles);
  node.id = 'qk-office-ai-styles';
  doc.head.append(node);
}

export function positionOfficeAI(node, left, top) {
  const view = node.ownerDocument.defaultView;
  const box = node.getBoundingClientRect();
  node.style.left = Math.max(8, Math.min(left, view.innerWidth - box.width - 8)) + 'px';
  node.style.top = Math.max(8, Math.min(top, view.innerHeight - box.height - 8)) + 'px';
}

function previewChart(doc, chart) {
  const figure = officeAIElement(doc, 'div');
  figure.append(officeAIElement(doc, 'strong', chart.title));
  const canvas = officeAIElement(doc, 'canvas');
  canvas.width = 460; canvas.height = 140;
  canvas.setAttribute('aria-hidden', 'true');
  figure.append(canvas);
  const ctx = canvas.getContext('2d');
  const palette = ['#5487eb', '#35a981', '#d78152', '#ae75d5'];
  const values = chart.series.flatMap(s => s.values);
  const min = values.reduce((a, b) => Math.min(a, b), 0);
  const max = values.reduce((a, b) => Math.max(a, b), 0);
  const xstep = 428 / chart.categories.length;
  const y = value => 126 - 112 * ((value - min) / (max - min || 1));
  ctx.strokeStyle = '#8994a6';
  ctx.beginPath(); ctx.moveTo(16, y(0)); ctx.lineTo(444, y(0)); ctx.stroke();
  if (chart.type === 'pie') {
    const data = chart.series[0].values;
    const total = data.reduce((sum, value) => sum + Math.max(0, value), 0);
    let start = -Math.PI / 2;
    data.forEach((value, index) => {
      const end = start + Math.PI * 2 * Math.max(0, value) / (total || 1);
      ctx.fillStyle = palette[index % palette.length];
      ctx.beginPath(); ctx.moveTo(230, 70); ctx.arc(230, 70, 62, start, end); ctx.fill();
      start = end;
    });
  } else {
    chart.series.forEach((series, index) => {
      ctx.fillStyle = ctx.strokeStyle = palette[index % palette.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.values.forEach((value, column) => {
        const x = 16 + xstep * (column + 0.5);
        if (chart.type === 'line') {
          if (column) ctx.lineTo(x, y(value)); else ctx.moveTo(x, y(value));
          ctx.fillRect(x - 2, y(value) - 2, 4, 4);
        } else {
          const width = xstep * 0.8 / chart.series.length;
          ctx.fillRect(x - xstep * 0.4 + width * index, y(0), width, y(value) - y(0));
        }
      });
      ctx.stroke();
    });
  }
  renderTable(doc, figure, [['类别', ...chart.series.map(s => s.name)],
    ...chart.categories.map((category, i) => [category, ...chart.series.map(s => s.values[i])])]);
  return figure;
}

function renderTable(doc, parent, rows) {
  const table = officeAIElement(doc, 'table');
  rows.forEach((row, index) => {
    const tr = table.insertRow();
    for (const value of row) tr.append(officeAIElement(doc, index ? 'td' : 'th', value ?? ''));
  });
  parent.append(table);
}

export function createOfficeAIDiff({ session, doc, viewport, anchor, generate, onClose, validate, confirmApply, onChangeSet = () => {} }) {
  ensureOfficeAIStyles(doc);
  const node = officeAIElement(doc, 'section', null, 'qk-office-ai-surface qk-office-ai-result');
  node.setAttribute('aria-label', '选区 AI 结果');
  const title = officeAIElement(doc, 'header', '选区 AI');
  const content = officeAIElement(doc, 'div', null, 'qk-office-ai-content');
  const footer = officeAIElement(doc, 'footer');
  node.append(title, content, footer);
  doc.body.append(node);
  let drag, moved = false, controller, result, selection, token, busy = false, closed = false;
  let keep = session.kind === 'writer';
  const layout = () => {
    if (!moved) {
      const bounds = anchor();
      if (!viewport) {
        positionOfficeAI(node, bounds.left, bounds.bottom + 8);
        return;
      }
      const area = viewport.getBoundingClientRect();
      node.style.maxHeight = Math.max(0, area.height - 16) + 'px';
      node.style.maxWidth = Math.max(0, area.width - 16) + 'px';
      // Leave a line of document content visible between the selection and the card.
      const below = bounds.bottom + 28;
      const dock = below + node.offsetHeight + 8 > area.bottom;
      node.dataset.docked = String(dock);
      const top = dock ? area.bottom - node.offsetHeight - 8 : below;
      positionOfficeAI(node, Math.max(area.left + 8, Math.min(bounds.left, area.right - node.offsetWidth - 8)),
        Math.max(area.top + 8, top));
    }
  };
  title.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { x: event.clientX - node.offsetLeft, y: event.clientY - node.offsetTop };
    title.setPointerCapture(event.pointerId);
  });
  title.addEventListener('pointermove', event => {
    if (!drag) return;
    moved = true;
    positionOfficeAI(node, event.clientX - drag.x, event.clientY - drag.y);
  });
  title.addEventListener('lostpointercapture', () => { drag = null; });

  function close(force = false) {
    if (busy && force !== true) return false;
    if (closed) return true;
    closed = true;
    controller?.abort();
    node.remove();
    onClose();
    return true;
  }

  function button(label, handler, style) {
    const control = officeAIElement(doc, 'button', label, style);
    control.type = 'button';
    control.addEventListener('click', handler);
    footer.append(control);
    return control;
  }

  async function accept(value) {
    if (busy || closed) return;
    busy = true;
    for (const control of footer.querySelectorAll('button,select')) control.disabled = true;
    try {
      await validate();
      if (confirmApply && !await confirmApply(node)) {
        showResult(value !== result, value.text);
        return;
      }
      await validate();
      if (closed) return;
      const receipt = await applyOfficeAIResult(session, value, { keep, original: selection, token });
      if (receipt.changeSet) {
        try { onChangeSet(receipt.changeSet); } catch (error) {
          console.error('Office AI change set observer failed', error);
        }
      }
      if (closed) return;
      title.textContent = '选区 AI';
      content.textContent = receipt.warning ?? '已应用。按 ⌘Z 撤回。';
      footer.replaceChildren();
      button('关闭', close);
    } catch (error) {
      if (closed) return;
      if (error.code === 'selection_changed') {
        showError(error);
        return;
      }
      showResult(value !== result, value.text);
      const note = officeAIElement(doc, 'p', error.message);
      note.setAttribute('role', 'alert');
      content.prepend(note);
    } finally {
      busy = false;
      layout();
    }
  }

  function showResult(edit = false, draft = result.text) {
    content.replaceChildren();
    footer.replaceChildren();
    let input;
    if (edit) {
      input = officeAIElement(doc, 'textarea');
      input.setAttribute('aria-label', '编辑替换结果');
      input.value = draft;
      content.append(input);
    } else if (result.type === 'text') {
      for (const part of diffOfficeWords(selection.text, result.text)) {
        content.append(officeAIElement(doc, { equal: 'span', insert: 'ins', delete: 'del' }[part.type], part.text));
      }
    } else if (result.type === 'table') renderTable(doc, content, result.rows);
    else if (result.type === 'chart') content.append(previewChart(doc, result.chart));
    else {
      content.textContent = result.text;
      if (result.type === 'formula') button('复制公式', async () => {
        try { await doc.defaultView.navigator.clipboard.writeText(result.text); }
        catch {
          const note = officeAIElement(doc, 'p', '无法访问剪贴板，请选中公式后复制。');
          note.setAttribute('role', 'alert');
          if (!content.querySelector('[role=alert]')) content.append(note);
        }
      });
      button('重试', run);
      button('关闭', close);
      layout();
      return;
    }
    if (result.type === 'text') {
      const mode = officeAIElement(doc, 'select');
      mode.setAttribute('aria-label', '修订处理方式');
      for (const [value, label] of [['keep', '保留为修订'], ['direct', '直接接受修订']]) {
        const option = officeAIElement(doc, 'option', label);
        option.value = value;
        mode.append(option);
      }
      mode.value = keep ? 'keep' : 'direct';
      mode.addEventListener('change', () => { keep = mode.value === 'keep'; });
      const revision = officeAIElement(doc, 'div', null, 'qk-office-ai-revision');
      revision.append(mode);
      if (session.kind === 'writer') {
        const hint = officeAIElement(doc, 'small', 'Writer 默认保留修订');
        revision.append(hint);
      }
      footer.append(revision);
    }
    const submit = button('接受', () => accept(edit ? { type: 'text', text: input.value } : result), 'qk-office-ai-primary');
    button('拒绝', close, 'qk-office-ai-reject');
    button('重试', run);
    if (result.type === 'text' && !edit) button('编辑后接受', () => showResult(true));
    if (edit) {
      const update = () => { submit.disabled = !input.value.trim(); };
      input.addEventListener('input', update);
      update();
      input.focus();
    }
    layout();
  }

  function showError(error) {
    title.textContent = '选区 AI';
    const note = officeAIElement(doc, 'p', error.message);
    note.setAttribute('role', 'alert');
    content.replaceChildren(note);
    footer.replaceChildren();
    button('重试', run);
    button('关闭', close);
    layout();
  }

  async function run() {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    result = undefined;
    title.textContent = '选区 AI · 生成中';
    content.textContent = '正在生成…';
    footer.replaceChildren();
    button('取消', close);
    layout();
    let streamed = '';
    try {
      const generated = await generate({ signal: current.signal, onDelta(delta) {
        if (current.signal.aborted) return;
        streamed += delta;
        content.textContent = streamed;
        content.scrollTop = content.scrollHeight;
        layout();
      } });
      if (current.signal.aborted) return;
      ({ selection, token, result } = generated);
      title.textContent = '选区 AI · 预览';
      showResult();
    } catch (error) {
      if (current.signal.aborted) return;
      showError(error);
    }
  }

  void run();
  return { close };
}
