import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createMockSession } from '../src/office/mock-session.js';
import { UNO } from '../src/office/session-types.js';
import { createOfficeToolbar } from '../src/ui/office-toolbar.js';
import { createFloatToolbar } from '../src/ui/office-float-toolbar.js';

let dom;
let host;
let dispose;
let observers;
let priority;

beforeEach(() => {
  dom = new JSDOM('<main><textarea></textarea></main>');
  host = dom.window.document.querySelector('main');
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 840, height: 600 });
  observers = new Set();
  priority = 3;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    AbortController: dom.window.AbortController,
    CustomEvent: dom.window.CustomEvent,
    getComputedStyle: () => ({ getPropertyValue: () => String(priority) }),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.add(this); }
      disconnect() { observers.delete(this); }
    },
  });
  dispose = [];
});

afterEach(() => {
  for (const controller of dispose) controller.destroy();
  dom.window.close();
});

function mount(controller) {
  dispose.push(controller);
  host.append(controller.element);
  controller.refresh?.();
  return controller.element;
}

const control = (root, label) => root.querySelector('[aria-label="' + label + '"]');
const text = (y = 100) => ({ kind: 'text', text: '选区', rects: [{ x: 80, y, w: 180, h: 20 }] });
const mock = () => createMockSession({ toScreen: rect => rect });

function key(target, value) {
  target.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
}

test('state syncs between both toolbars and commands use the current selection formatting', () => {
  const session = mock();
  const toolbar = mount(createOfficeToolbar(session));
  const float = mount(createFloatToolbar(session));
  session.setSelection(text());
  control(toolbar, '加粗').click();
  assert.equal(session.state.get(UNO.Bold).checked, true);
  assert.equal(control(float, '加粗').getAttribute('aria-pressed'), 'true');
  session.setState(UNO.Italic, { enabled: false });
  assert.equal(control(toolbar, '斜体').disabled, true);
  assert.equal(control(float, '斜体').disabled, true);
  session.setState(UNO.FontHeight, { value: 18 });
  control(float, '增大字号').click();
  assert.equal(control(toolbar, '字号').value, '19');
  assert.deepEqual(session.calls.at(-1), { command: UNO.FontHeight, args: { FontHeight: 19 } });
});

test('Writer, Impress and Calc render the correct controls when switching kinds', () => {
  const session = mock();
  const writer = mount(createOfficeToolbar(session, 'writer'));
  const impress = mount(createOfficeToolbar(session, 'impress'));
  const calc = mount(createOfficeToolbar(session, 'calc'));
  assert.equal(writer.dataset.kind, 'writer');
  assert.equal(control(writer, '版式'), null);
  assert.ok(control(impress, '版式'));
  control(impress, '新建幻灯片').click();
  assert.equal(session.calls.at(-1).command, UNO.InsertPage);
  assert.ok(control(calc, '数字格式'));
  assert.ok(control(calc, '合并单元格'));
  assert.match(calc.textContent, /公式栏.*工作表/);
});

test('text selection opens above or flips below and non-text or empty selection hides it', () => {
  const session = mock();
  const float = mount(createFloatToolbar(session));
  assert.equal(float.hidden, true);
  session.setSelection(text());
  assert.equal(float.hidden, false);
  assert.equal(float.dataset.placement, 'above');
  assert.equal(float.style.top, '58px');
  session.setSelection(text(4));
  assert.equal(float.dataset.placement, 'below');
  assert.equal(float.style.top, '32px');
  session.setSelection({ ...text(), kind: 'cell' });
  assert.equal(float.hidden, true);
  session.setSelection({ ...text(), rects: [] });
  assert.equal(float.hidden, true);
});

test('scroll, composition and Escape dismiss the floating toolbar', async () => {
  const session = mock();
  const float = mount(createFloatToolbar(session));
  const input = host.querySelector('textarea');
  session.setSelection(text());
  host.dispatchEvent(new window.Event('scroll'));
  assert.equal(float.hidden, true);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(float.hidden, false);
  input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }));
  session.setSelection(text());
  assert.equal(float.hidden, true);
  input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  assert.equal(float.hidden, false);
  control(float, '字体色').click();
  key(control(float, '字体色'), 'Escape');
  assert.equal(float.hidden, true);
  session.setSelection(text(150));
  assert.equal(float.hidden, false);
});

test('addSection replaces the AI placeholder and preserves other sections', () => {
  const session = mock();
  const lifecycle = [];
  const toolbar = createFloatToolbar(session, { sections: { extra: container => {
    container.textContent = '额外';
    return () => lifecycle.push('销毁');
  } } });
  const float = mount(toolbar);
  assert.ok(control(float, 'AI').disabled);
  toolbar.addSection('ai', container => {
    container.textContent = '旧内容';
    return () => lifecycle.push(container.textContent);
  });
  toolbar.addSection('ai', (container, received) => {
    assert.equal(received, session);
    assert.deepEqual(lifecycle, ['旧内容']);
    const item = document.createElement('button');
    item.textContent = '润色';
    container.append(item);
  });
  assert.equal(float.querySelectorAll('[data-section="ai"]').length, 1);
  assert.equal(float.querySelector('[data-section="ai"]').textContent, '润色');
  assert.equal(float.querySelector('[data-section="extra"]').textContent, '额外');
  assert.ok(control(float, '加粗'));
  toolbar.destroy();
  assert.deepEqual(lifecycle, ['旧内容', '销毁']);
});

test('keyboard can reach enabled controls and invoke a button through its native activation path', () => {
  const session = mock();
  const float = mount(createFloatToolbar(session));
  session.setSelection(text());
  session.setState(UNO.Italic, { enabled: false });
  const bold = control(float, '加粗');
  bold.focus();
  assert.equal(document.activeElement, bold);
  assert.equal(bold.tabIndex, 0);
  key(bold, 'ArrowRight');
  const underline = control(float, '下划线');
  assert.equal(document.activeElement, underline);
  assert.equal(underline.tabIndex, 0);
  // jsdom does not synthesize the native click for Enter.
  underline.click();
  assert.equal(session.calls.at(-1).command, UNO.Underline);
  key(underline, 'ArrowLeft');
  assert.equal(document.activeElement, bold);
});

test('read-only greys out controls, shows its label and hides the floating toolbar', () => {
  const session = mock();
  const toolbar = mount(createOfficeToolbar(session, 'calc'));
  const float = mount(createFloatToolbar(session));
  session.setSelection(text());
  session.setReadOnly(true);
  assert.equal(toolbar.querySelector('[role="status"]').textContent, '只读');
  assert.ok(toolbar.classList.contains('qk-office-readonly'));
  assert.ok([...toolbar.querySelectorAll('button, select')].every(item => item.disabled));
  control(toolbar, '加粗').click();
  assert.equal(session.calls.length, 0);
  assert.equal(float.hidden, true);
  session.setReadOnly(false);
  assert.equal(control(toolbar, '加粗').disabled, false);
  assert.equal(float.hidden, false);
});

test('More moves groups at container breakpoints and forwards nested table commands', () => {
  const session = mock();
  const toolbar = mount(createOfficeToolbar(session, 'impress'));
  const more = control(toolbar, '更多');
  assert.equal(more.parentElement.hidden, true);
  priority = 1;
  for (const observer of observers) observer.callback();
  assert.equal(more.parentElement.hidden, false);
  more.click();
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  assert.ok(more.parentElement.contains(control(toolbar, '版式')));
  control(toolbar, '插入').click();
  control(toolbar, '插入表格').click();
  control(toolbar, '3 列 2 行').click();
  assert.deepEqual(session.calls.at(-1), { command: UNO.InsertTable, args: { Rows: 2, Columns: 3 } });
  priority = 3;
  for (const observer of observers) observer.callback();
  assert.equal(more.parentElement.hidden, true);
  assert.ok(!more.parentElement.contains(control(toolbar, '版式')));
});

test('recent colors chosen in one toolbar are available in the other', () => {
  const session = mock();
  const toolbar = mount(createOfficeToolbar(session));
  const float = mount(createFloatToolbar(session));
  session.setSelection(text());
  control(toolbar, '字体色').click();
  control(toolbar, '字体色 #2563eb').click();
  assert.equal(session.state.get(UNO.Color).value, 0x2563eb);
  control(float, '字体色').click();
  assert.equal(float.querySelectorAll('[aria-label="字体色 #2563eb"]').length, 2);
});

test('mock tracks selection changes, rejection, undo, redo and save events', async () => {
  const session = mock();
  session.setSelection(text());
  const seen = [];
  const off = session.on('changes', items => seen.push(items));
  const { token } = await session.getSelection({ context: 2 });
  const result = await session.replaceSelection('修改', { track: true, token });
  const [{ id }] = seen.at(-1);
  assert.deepEqual(result, { ok: true, changeId: id, changeset: { id, before: '选区', after: '修改' } });
  await session.rejectChange(id);
  assert.equal(session.selection.text, '选区');
  await session.undo();
  assert.equal(session.selection.text, '修改');
  await session.redo();
  assert.equal(session.selection.text, '选区');
  off();
  const saved = await session.save({ reason: 'manual' });
  assert.equal(saved.reason, 'manual');
  assert.ok(Number.isFinite(saved.at));
});


test('selection tokens reject a stale write and direct acceptance is one undo in all kinds', async () => {
  for (const kind of ['writer', 'impress', 'calc']) {
    const session = createMockSession({ kind, selection: text() });
    const stale = session.selection.token;
    session.setSelection(text());
    const token = session.selection.token;
    assert.notEqual(token, stale);
    assert.deepEqual(await session.replaceSelection('错误', { track: true, token: stale }), {
      ok: false, reason: 'selection_changed',
    });
    assert.equal(session.selection.text, '选区');
    assert.equal(session.state.get(UNO.Undo).enabled, false);
    const { ok, changeId } = await session.replaceSelection('已修改', { track: true, token });
    assert.equal(ok, true);
    assert.notEqual(session.selection.token, token);
    await session.acceptChange(changeId);
    await session.undo();
    assert.equal(session.selection.text, '选区');
    assert.equal(session.state.get(UNO.Undo).enabled, false);
    await session.redo();
    assert.equal(session.selection.text, '已修改');
  }
});

test('Calc cell selection without text shows only style and AI in the supplied viewport', () => {
  const session = createMockSession({ kind: 'calc', toScreen: rect => rect });
  const viewport = document.createElement('article');
  host.append(viewport);
  viewport.getBoundingClientRect = () => ({ left: 25, top: 60, width: 400, height: 300 });
  const toolbar = createFloatToolbar(session, {
    viewport,
    sections: { extra: container => { container.textContent = '仅文字'; } },
  });
  const float = mount(toolbar);
  session.setSelection({ ...text(2), kind: 'cell', text: '' });
  assert.equal(float.hidden, false);
  assert.equal(float.dataset.placement, 'below');
  assert.deepEqual([...float.children].filter(el => !el.hidden).map(el => el.dataset.section), ['style', 'ai']);
  session.setSelection(text());
  assert.equal(float.querySelector('[data-section="extra"]').hidden, false);
});

test('top toolbar refreshes state and responds to session save events and retry', async () => {
  const at = new Date(2026, 10, 24, 16, 20).getTime();
  const session = createMockSession({ clock: () => at });
  const toolbar = createOfficeToolbar(session);
  const root = mount(toolbar);
  session.state.set(UNO.Bold, { enabled: false, checked: true, value: null });
  toolbar.refresh();
  assert.equal(control(root, '加粗').disabled, true);
  assert.equal(control(root, '加粗').getAttribute('aria-pressed'), 'true');
  const status = root.querySelector('.qk-office-save-status');
  assert.equal(status.hidden, true);
  session.emit('saving');
  assert.equal(status.textContent.replace('（重试）', ''), '保存中…');
  session.emit('conflict');
  assert.equal(status.dataset.status, 'conflict');
  assert.equal(control(status, '重试保存').hidden, true);
  session.emit('unsaved');
  assert.equal(status.textContent, '未保存（重试）');
  control(status, '重试保存').click();
  assert.equal(status.querySelector('[role="status"]').textContent, '已保存 · 16:20');
  assert.equal(control(status, '重试保存').hidden, true);
  toolbar.destroy();
  session.emit('unsaved');
  assert.equal(status.dataset.status, 'saved');
});


test('Calc uses cell formatting controls and dispatches their UNO commands', () => {
  const session = createMockSession({ kind: 'calc' });
  const toolbar = mount(createOfficeToolbar(session));
  for (const label of ['段落样式', '项目符号', '编号', '高亮']) assert.equal(control(toolbar, label), null);
  const merge = control(toolbar, '合并单元格');
  assert.equal(merge.title, '合并单元格');
  merge.click();
  assert.equal(session.state.get(UNO.ToggleMergeCells).checked, true);
  control(toolbar, '边框').click();
  control(toolbar, '外边框').click();
  assert.deepEqual(session.calls.at(-1), { command: UNO.SetBorderStyle, args: { preset: 'outer' } });

  const format = control(toolbar, '数字格式');
  assert.deepEqual([...format.options].slice(1).map(item => item.textContent), ['常规', '数字', '百分比', '货币', '日期']);
  format.value = UNO.NumberFormatDate;
  format.dispatchEvent(new window.Event('change'));
  assert.equal(session.state.get(UNO.NumberFormatDate).checked, true);
  assert.equal(session.state.get(UNO.NumberFormatStandard).checked, false);

  const fewer = control(toolbar, '减少小数位');
  const more = control(toolbar, '增加小数位');
  assert.equal(fewer.textContent, '.0');
  assert.equal(more.textContent, '.00');
  more.click();
  assert.equal(session.state.get(UNO.NumberFormatIncDecimals).value, 3);
  fewer.click();
  assert.equal(session.state.get(UNO.NumberFormatDecDecimals).value, 2);
});

test('saving status stays in the right column when controls move to More in each kind', () => {
  for (const kind of ['writer', 'impress', 'calc']) {
    const session = createMockSession({ kind });
    const toolbar = mount(createOfficeToolbar(session));
    const status = toolbar.querySelector('.qk-office-save-status');
    const header = status.parentElement;
    session.emit('saving');
    priority = -1;
    for (const observer of observers) observer.callback();
    const more = control(toolbar, '更多');
    more.click();
    assert.equal(header.lastElementChild, status);
    assert.equal(status.hidden, false);
    assert.equal(status.dataset.status, 'saving');
    assert.equal(more.parentElement.contains(status), false);
    priority = 3;
  }
});

test('Calc switches cell controls and clears headings, frozen rows and adjacent rows', () => {
  const session = createMockSession({ kind: 'calc', toScreen: rect => rect });
  const float = mount(createFloatToolbar(session));
  const visibleLabels = () => [...float.querySelectorAll('button[aria-label], select[aria-label]')]
    .filter(el => !el.closest('[hidden]')).map(el => el.getAttribute('aria-label'));
  const cell = (y, protectedTop) => ({
    ...text(y), kind: 'cell', text: '', cellLayout: { rowHeight: 20, protectedTop },
  });
  session.setSelection(cell(40, 40));
  assert.deepEqual(visibleLabels(), ['加粗', '斜体', '下划线', '字体色', '填充色', '数字格式', '清除格式', 'AI']);
  assert.equal(float.dataset.placement, 'below');
  assert.equal(float.style.top, '88px');

  session.setSelection(cell(90, 100));
  assert.equal(float.dataset.placement, 'below');
  assert.equal(float.style.top, '138px');
  session.setSelection(cell(225, 100));
  assert.equal(float.dataset.placement, 'above');
  assert.equal(float.style.top, '163px');
  session.setSelection(cell(565, 100));
  assert.equal(float.dataset.placement, 'above');
  assert.equal(float.style.top, '503px');

  session.setSelection(text());
  assert.ok(visibleLabels().includes('减小字号'));
  assert.ok(!visibleLabels().includes('填充色'));
});
