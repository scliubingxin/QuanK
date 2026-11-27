import { UNO } from '../office/session-types.js';
import { officeFontChoices } from '../shared/office-font-map.js';
import { officeIcon } from './office-icons.js';

const styles = ['Text Body', 'Heading 1', 'Heading 2', 'Heading 3'];
const styleLabels = ['正文', '标题 1', '标题 2', '标题 3'];
const colors = [
  0x000000, 0xffffff, 0x475569, 0xc2410c, 0xdc2626, 0xdb2777,
  0x7c3aed, 0x2563eb, 0x0891b2, 0x15803d, 0xca8a04, 0xfacc15,
  0xfecaca, 0xfde68a, 0xbbf7d0, 0xbfdbfe, 0xe9d5ff, 0xfbcfe8,
];
const recentBySession = new WeakMap();
// [v1.0.4] Chinese names map to the macOS families behind them; families the engine lacks are dropped.
const FONT_NAMES = ['Arial', 'Calibri', 'Times New Roman', 'Noto Sans CJK SC', '宋体', '微软雅黑'];

export function officeElement(tag, name, text) {
  const element = document.createElement(tag);
  if (name) element.className = 'qk-office-' + name;
  if (text) element.textContent = text;
  return element;
}

export function officeButton(label, icon, text) {
  const button = officeElement('button', 'button');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  if (icon) button.append(officeIcon(icon));
  if (text) button.append(officeElement('span', 'label', text));
  button.addEventListener('mousedown', event => {
    if (event.button === 0) event.preventDefault();
  });
  return button;
}

function disabled(session, command) {
  return session.state.get(command)?.enabled === false;
}

export function createOfficeControls(session, root) {
  const lifetime = new AbortController();
  const bindings = [];
  const menus = [];
  const palettes = [];
  if (!recentBySession.has(session)) recentBySession.set(session, new Map());
  const recent = recentBySession.get(session);

  function invoke(command, args) {
    if (session.readOnly || disabled(session, command)) return;
    const fail = error => {
      root.dispatchEvent(new CustomEvent('office-command-error', { detail: error, bubbles: true }));
    };
    try {
      Promise.resolve(session.uno(command, args)).catch(fail);
    } catch (error) {
      fail(error);
    }
  }

  function button(command, label, icon, { toggle = false, args, text, action } = {}) {
    const el = officeButton(label, icon, text);
    el.addEventListener('click', () => {
      if (action) action();
      else invoke(command, typeof args === 'function' ? args() : args);
    });
    bindings.push(() => {
      el.disabled = session.readOnly || disabled(session, command);
      if (toggle) el.setAttribute('aria-pressed', String(Boolean(session.state.get(command)?.checked)));
    });
    return el;
  }

  function close(entry, focus = false) {
    entry.panel.hidden = true;
    entry.trigger.setAttribute('aria-expanded', 'false');
    if (focus) entry.trigger.focus();
    for (const nested of menus) {
      if (nested !== entry && entry.panel.contains(nested.wrap)) close(nested);
    }
  }

  function closeMenus() {
    for (const entry of menus) close(entry);
  }

  function position(entry) {
    entry.panel.style.removeProperty('--qk-office-menu-shift');
    const edge = document.documentElement.clientWidth;
    const bounds = entry.panel.getBoundingClientRect();
    entry.panel.style.setProperty('--qk-office-menu-shift', Math.min(0, edge - bounds.right - 4) + 'px');
  }

  function menu(label, icon, { text, commands, prepare, keepOpen = false } = {}) {
    const wrap = officeElement('div', 'menu');
    const trigger = officeButton(label, icon, text);
    const panel = officeElement('div', 'panel');
    trigger.append(officeIcon('chevron'));
    trigger.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
    const entry = { wrap, trigger, panel };
    menus.push(entry);
    trigger.addEventListener('click', event => {
      if (!panel.hidden) return close(entry, event.detail === 0);
      for (const other of menus) {
        if (other !== entry && !other.wrap.contains(wrap)) close(other);
      }
      prepare?.();
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      position(menus.find(other => !other.panel.hidden && other.panel.contains(wrap)) ?? entry);
      if (event.detail === 0) panel.querySelector('button:not([disabled]), select:not([disabled])')?.focus();
    });
    panel.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!keepOpen && target && !target.closest('[aria-expanded]')) close(entry, event.detail === 0);
    });
    bindings.push(() => {
      trigger.disabled = session.readOnly || Boolean(commands?.every(cmd => disabled(session, cmd)));
      if (trigger.disabled) close(entry);
    });
    wrap.append(trigger, panel);
    return entry;
  }

  function select(label, icon, commands, options, current) {
    const wrap = officeElement('label', 'select');
    const input = document.createElement('select');
    input.title = label;
    input.setAttribute('aria-label', label);
    for (const option of options) {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      input.append(item);
    }
    const unknown = document.createElement('option');
    unknown.hidden = true;
    input.prepend(unknown);
    input.addEventListener('change', () => {
      const option = options.find(item => String(item.value) === input.value);
      if (option) invoke(option.command ?? commands[0], option.args);
    });
    bindings.push(() => {
      input.disabled = session.readOnly || commands.every(cmd => disabled(session, cmd));
      for (let i = 0; i < options.length; i++) {
        input.options[i + 1].disabled = disabled(session, options[i].command ?? commands[0]);
      }
      const value = String(current() ?? '');
      const optionIndex = options.findIndex(option => String(option.value) === value);
      unknown.value = optionIndex < 0 ? value : '';
      unknown.textContent = value || '—';
      input.selectedIndex = optionIndex + 1;
    });
    if (icon) wrap.append(officeIcon(icon));
    wrap.append(input);
    return wrap;
  }

  function values(command, label, icon, key, choices, labels = choices) {
    return select(label, icon, [command], choices.map((value, index) => ({
      value, label: labels[index], args: { [key]: value },
    })), () => session.state.get(command)?.value);
  }

  function color(command, label, icon, key) {
    const entry = menu(label, icon, {
      commands: [command],
      prepare: () => {
        entry.panel.replaceChildren();
        palette(colors, '色板');
        const used = recent.get(command) ?? [];
        if (used.length) palette(used, '最近使用');
      },
    });

    function palette(items, heading) {
      const list = officeElement('div', 'swatches');
      for (const value of items) {
        const hex = '#' + value.toString(16).padStart(6, '0');
        const swatch = officeButton(label + ' ' + hex);
        swatch.classList.add('qk-office-swatch');
        swatch.style.setProperty('--qk-office-color', hex);
        swatch.setAttribute('aria-pressed', String(String(session.state.get(command)?.value) === String(value)));
        swatch.addEventListener('click', () => {
          const prior = recent.get(command) ?? [];
          recent.set(command, [value, ...prior.filter(item => item !== value)].slice(0, 6));
          invoke(command, { [key]: value });
        });
        list.append(swatch);
      }
      entry.panel.append(officeElement('div', 'panel-label', heading), list);
    }

    palettes.push(() => {
      if (!entry.panel.hidden) {
        for (const swatch of entry.panel.querySelectorAll('.qk-office-swatch')) {
          const hex = swatch.style.getPropertyValue('--qk-office-color');
          swatch.setAttribute('aria-pressed', String(String(session.state.get(command)?.value) === String(parseInt(hex.slice(1), 16))));
        }
      }
      const state = session.state.get(command)?.value;
      const value = Number(state);
      const hex = state != null && state !== '' && Number.isInteger(value) && value >= 0 && value <= 0xffffff
        ? '#' + value.toString(16).padStart(6, '0') : '';
      entry.trigger.style.setProperty('--qk-office-ink', hex || (command === UNO.CharBackColor ? '#eab308' : 'currentColor'));
      entry.trigger.classList.add('qk-office-ink');
    });
    return entry.wrap;
  }

  function refresh() {
    root.classList.toggle('qk-office-readonly', session.readOnly);
    for (const update of bindings) update();
    for (const update of palettes) update();
  }

  function listen() {
    const off = session.on('state', refresh);
    lifetime.signal.addEventListener('abort', () => { if (typeof off === 'function') off(); }, { once: true });
    document.addEventListener('pointerdown', event => {
      for (const entry of menus) {
        if (!entry.wrap.contains(event.target)) close(entry);
      }
    }, { signal: lifetime.signal });
    root.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || root.classList.contains('qk-office-float')) return;
      const open = menus.filter(entry => !entry.panel.hidden);
      const entry = open.findLast(item => item.wrap.contains(event.target)) ?? open.at(-1);
      if (!entry) return;
      close(entry, true);
      event.stopImmediatePropagation();
    }, { signal: lifetime.signal });
    refresh();
  }

  const toggle = (cmd, label, icon) => button(cmd, label, icon, { toggle: true });
  const numberFormats = [
    [UNO.NumberFormatStandard, '常规'], [UNO.NumberFormatDecimal, '数字'],
    [UNO.NumberFormatPercent, '百分比'], [UNO.NumberFormatCurrency, '货币'], [UNO.NumberFormatDate, '日期'],
  ];
  const formatCommands = numberFormats.map(([command]) => command);
  return {
    button, toggle, menu, select, values, closeMenus, listen, refresh,
    destroy: () => lifetime.abort(),
    style: () => values(UNO.StyleApply, '段落样式', 'style', 'Style', styles, styleLabels),
    emphasis: () => [
      toggle(UNO.Bold, '加粗', 'bold'), toggle(UNO.Italic, '斜体', 'italic'), toggle(UNO.Underline, '下划线', 'underline'),
    ],
    colors: (cell = false) => [
      color(UNO.Color, '字体色', 'color', 'Color'),
      cell ? color(UNO.BackgroundColor, '填充色', 'fill', 'BackgroundColor')
        : color(UNO.CharBackColor, '高亮', 'highlight', 'CharBackColor'),
    ],
    numberFormat: () => select('数字格式', null, formatCommands, numberFormats.map(([command, label]) => ({
      command, value: command, label,
    })), () => formatCommands.find(command => session.state.get(command)?.checked)),
    lists: () => [
      toggle(UNO.DefaultBullet, '项目符号', 'bullet'), toggle(UNO.DefaultNumbering, '编号', 'numbering'),
    ],
  };
}

function borderMenu(controls) {
  const entry = controls.menu('边框', 'border', { commands: [UNO.SetBorderStyle] });
  for (const [preset, label] of [
    ['none', '无边框'], ['outer', '外边框'], ['all', '所有边框'],
    ['top', '上边框'], ['bottom', '下边框'], ['left', '左边框'], ['right', '右边框'],
  ]) {
    entry.panel.append(controls.button(UNO.SetBorderStyle, label, null, { text: label, args: { preset } }));
  }
  return entry.wrap;
}

function insertMenu(controls, native = false) {
  const commands = [UNO.InsertTable, UNO.InsertGraphic, UNO.InsertObjectChart, UNO.InsertAnnotation];
  const insert = controls.menu('插入', 'insert', { text: '插入', commands });
  const table = controls.menu('插入表格', 'table', { text: '表格', commands: [UNO.InsertTable] });
  const caption = officeElement('div', 'panel-label', '选择表格大小');
  caption.setAttribute('aria-live', 'polite');
  const grid = officeElement('div', 'table-grid');
  function preview(rows, columns) {
    caption.textContent = columns + ' × ' + rows;
    for (const [index, cell] of [...grid.children].entries()) {
      cell.classList.toggle('qk-office-cell-selected', index % 6 < columns && Math.floor(index / 6) < rows);
    }
  }
  for (let rows = 1; rows <= 6; rows++) {
    for (let columns = 1; columns <= 6; columns++) {
      const cell = controls.button(UNO.InsertTable, columns + ' 列 ' + rows + ' 行', null, {
        args: { Rows: rows, Columns: columns },
      });
      cell.addEventListener('pointerenter', () => preview(rows, columns));
      cell.addEventListener('focus', () => preview(rows, columns));
      grid.append(cell);
    }
  }
  grid.addEventListener('keydown', event => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const index = [...grid.children].indexOf(event.target);
    grid.children[Math.max(0, Math.min(35, index + delta))].focus();
  });
  table.panel.append(caption, grid);
  insert.panel.append(table.wrap);
  if (!native) insert.panel.append(controls.button(UNO.InsertGraphic, '插入图片', 'image', { text: '图片' }),
    controls.button(UNO.InsertObjectChart, '插入图表', 'chart', { text: '图表' }),
    controls.button(UNO.InsertAnnotation, '插入批注', 'comment', { text: '批注' }));
  return insert.wrap;
}

export function createOfficeToolbar(session, kind = session.kind, { native = false, fonts } = {}) {
  const element = officeElement('div', 'toolbar');
  const row = officeElement('div', 'toolbar-row');
  row.setAttribute('role', 'toolbar');
  row.setAttribute('aria-label', 'Office 编辑工具栏');
  element.dataset.kind = kind;
  const controls = createOfficeControls(session, element);
  const groups = [];

  function group(priority, ...items) {
    const el = officeElement('div', 'group');
    el.append(...items);
    groups.push({ el, priority });
  }

  group(0, controls.button(UNO.Undo, '撤销', 'undo'), controls.button(UNO.Redo, '重做', 'redo'));
  const calc = kind === 'calc';
  const fontChoices = officeFontChoices(FONT_NAMES, fonts);
  group(1, ...(calc ? [] : [controls.style()]),
    controls.values(UNO.CharFontName, '字体', null, 'CharFontName.FamilyName',
      fontChoices.map(choice => choice.family), fontChoices.map(choice => choice.label)),
    controls.values(UNO.FontHeight, '字号', null, 'FontHeight', [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]));
  group(0, ...controls.emphasis(), controls.toggle(UNO.Strikeout, '删除线', 'strike'), ...controls.colors(calc));
  group(1, controls.toggle(UNO.LeftPara, '左对齐', 'left'), controls.toggle(UNO.CenterPara, '居中', 'center'),
    controls.toggle(UNO.RightPara, '右对齐', 'right'), controls.toggle(UNO.JustifyPara, '两端对齐', 'justify'));
  if (calc) {
    group(0, controls.toggle(UNO.ToggleMergeCells, '合并单元格', 'merge'),
      borderMenu(controls), controls.numberFormat(),
      controls.button(UNO.NumberFormatDecDecimals, '减少小数位', null, { text: '.0' }),
      controls.button(UNO.NumberFormatIncDecimals, '增加小数位', null, { text: '.00' }));
  } else {
    group(1, ...controls.lists());
  }
  if (!native || kind === 'writer') group(2, insertMenu(controls, native), controls.toggle(UNO.TrackChanges, '修订', 'track'));
  if (!native) group(2, controls.values(UNO.Zoom, '缩放', 'zoom', 'Zoom', [50, 75, 100, 125, 150, 200], ['50%', '75%', '100%', '125%', '150%', '200%']));
  if (kind === 'impress' && !native) {
    group(3, controls.button(UNO.InsertPage, '新建幻灯片', 'slide', { text: '新建幻灯片' }),
      controls.values(UNO.AssignLayout, '版式', 'layout', 'Layout', [0, 1, 3, 20], ['标题页', '标题和内容', '两栏内容', '空白']));
  }
  const more = controls.menu('更多', 'more', { text: '更多', keepOpen: true });
  more.wrap.classList.add('qk-office-more');
  const saveStatus = officeElement('div', 'save-status');
  const saveLabel = officeElement('span', 'save-label');
  saveLabel.setAttribute('role', 'status');
  const retry = officeButton('重试保存', null, '（重试）');
  retry.hidden = true;
  saveStatus.hidden = true;
  saveStatus.append(saveLabel, retry);
  const saveTime = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let status;
  function updateSaveStatus(event, detail) {
    status = event;
    saveStatus.hidden = false;
    saveStatus.dataset.status = event;
    saveStatus.title = detail?.error || '';
    const date = detail?.at == null ? null : new Date(detail.at);
    const time = date && Number.isFinite(date.getTime()) ? ' · ' + saveTime.format(date) : '';
    saveLabel.textContent = {
      saving: '保存中…', saved: '已保存' + time, unsaved: '未保存', conflict: '保存冲突',
    }[event];
    retry.hidden = event !== 'unsaved';
    retry.disabled = session.readOnly;
    layout();
  }
  retry.addEventListener('click', async () => {
    if (session.readOnly || status !== 'unsaved') return;
    updateSaveStatus('saving');
    try {
      const result = await session.save({ reason: 'manual' });
      if (result?.ok === false && status === 'saving') updateSaveStatus('unsaved');
    } catch {
      if (status === 'saving') updateSaveStatus('unsaved');
    }
  });
  const readOnly = officeElement('span', 'readonly-label', '只读');
  readOnly.setAttribute('role', 'status');
  row.append(...groups.map(({ el }) => el), more.wrap);
  const header = officeElement('div', 'toolbar-header');
  header.append(row, readOnly, saveStatus);
  element.append(header);
  if (calc && !native) {
    const extras = officeElement('div', 'calc');
    for (const [icon, label] of [['formula', '公式栏'], ['sheet', '工作表']]) {
      const placeholder = officeElement('span', 'placeholder', label);
      placeholder.prepend(officeIcon(icon));
      extras.append(placeholder);
    }
    element.append(extras);
  }

  let visiblePriority;
  function layout() {
    const limit = Number(getComputedStyle(row).getPropertyValue('--qk-office-visible-priority').trim() || 3);
    if (limit === visiblePriority) return;
    visiblePriority = limit;
    controls.closeMenus();
    for (const { el, priority } of groups) {
      if (priority <= limit) row.insertBefore(el, more.wrap);
      else more.panel.append(el);
    }
    more.wrap.hidden = !more.panel.childElementCount;
  }
  function refresh() {
    controls.refresh();
    retry.disabled = session.readOnly;
    layout();
  }

  controls.listen();
  const offState = session.on('state', () => { retry.disabled = session.readOnly; });
  const offSaveStatus = ['saving', 'saved', 'unsaved', 'conflict'].map(event =>
    session.on(event, detail => updateSaveStatus(event, detail)));
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  observer?.observe(element);
  layout();
  return {
    element, refresh,
    destroy() {
      observer?.disconnect();
      offState();
      for (const off of offSaveStatus) off();
      controls.destroy();
      element.remove();
    },
  };
}
