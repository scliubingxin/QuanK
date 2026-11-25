import { createOfficeAIDiff, selectionChanged, ensureOfficeAIStyles, officeAIElement, positionOfficeAI } from './office-ai-diff.js';

const entries = [
  ['polish', '✦', '润色'],
  ['rewrite', '↻', '改写'],
  ['expand', '↗', '扩写'],
  ['shorten', '↘', '缩写'],
  ['translate', '文', '翻译', 'language', [['en', '英语'], ['zh', '中文'], ['ja', '日语']]],
  ['tone', '≈', '换语气', 'tone', [['formal', '正式'], ['casual', '口语'], ['concise', '简洁'], ['persuasive', '有说服力']]],
  ['continue', '→', '续写'],
  ['to_table', '▦', '转表格'],
  ['to_chart', '▥', '生成图表数据'],
];

const cellEntries = [
  ['explain', 'ⓘ', '解释'],
  ['formula', 'ƒ', '生成公式'],
  ['to_chart', '▥', '转图表'],
];
const isCellSelection = session => session.kind === 'calc' && session.selection?.kind === 'cell';

export function mountOfficeAIMenu({
  session, floatToolbar, ai, root, input, doc = root?.ownerDocument ?? document,
  allowChart = true, confirmApply, getOptions = () => ({}), onChangeSet = () => {},
}) {
  ensureOfficeAIStyles(doc);
  let trigger, menu, panel, epoch = 0, destroyed = false;
  const invalidate = () => { epoch++; closeMenu(); };
  let selectionToken = session.selection?.token;
  const offSelection = session.on('selection', selection => {
    if (selection?.token === selectionToken) return;
    selectionToken = selection?.token;
    invalidate();
  });
  const offDirty = session.on('dirty', invalidate);
  const actionsFor = () => (isCellSelection(session) ? cellEntries : entries).filter(([id]) => allowChart || id !== 'to_chart' && (id !== 'to_table' || session.kind === 'writer'));
  const blocked = () => session.readOnly ? '当前文档为只读。' : ai.blockReason?.() || '';

  function closeMenu() {
    menu?.remove();
    menu = undefined;
    trigger?.setAttribute('aria-expanded', 'false');
  }

  function selectionAnchor(button) {
    const rects = session.selection?.rects ?? [];
    const screen = rects.map(rect => session.toScreen(rect)).filter(Boolean);
    if (!screen.length) return button.getBoundingClientRect();
    const origin = root?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      left: origin.left + Math.min(...screen.map(rect => rect.x)),
      bottom: origin.top + Math.max(...screen.map(rect => rect.y + rect.h)),
    };
  }

  function start(action, options) {
    closeMenu();
    if (panel?.close() === false) return;
    let generation;
    const guard = () => {
      const reason = blocked();
      if (reason) throw Error(reason);
      if (epoch !== generation.epoch || session.selection?.token !== generation.token) throw selectionChanged();
    };
    panel = createOfficeAIDiff({
      session, doc, viewport:root, confirmApply, anchor: () => selectionAnchor(trigger), onChangeSet,
      async generate({ signal, onDelta }) {
        const kind = session.selection?.kind;
        const token = session.selection?.token;
        const actions = actionsFor();
        if (!['cell', 'text'].includes(kind) || token == null ||
            !(actions.some(([id]) => id === action) || (kind === 'text' && action === 'ask'))) throw selectionChanged();
        generation = { epoch, token };
        guard();
        const selection = await session.getSelection({ context: 2 });
        signal.throwIfAborted();
        guard();
        const result = await ai.run({ ...getOptions(), ...options, action, kind: session.kind, selection }, { signal, onDelta });
        return { selection, token, result };
      },
      validate: guard,
      onClose() { panel = undefined; },
    });
  }

  function toggle(button, focus) {
    if (menu) { closeMenu(); return; }
    menu = officeAIElement(doc, 'div', null, 'qk-office-ai-surface qk-office-ai-menu');
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', '选区 AI 操作');
    const reason = blocked();
    if (reason) {
      menu.append(officeAIElement(doc, 'p', reason));
    } else {
      const cell = isCellSelection(session);
      const addLabel = (item, icon, label, expandable) => {
        const glyph = officeAIElement(doc, 'span', icon, 'qk-office-ai-glyph');
        glyph.setAttribute('aria-hidden', 'true');
        item.append(glyph, officeAIElement(doc, 'span', label));
        if (expandable) {
          const chevron = officeAIElement(doc, 'span', '›', 'qk-office-ai-chevron');
          chevron.setAttribute('aria-hidden', 'true');
          item.append(chevron);
        }
      };
      for (const [action, icon, label, param, choices] of actionsFor()) {
        if (choices) {
          const submenu = officeAIElement(doc, 'details');
          const summary = officeAIElement(doc, 'summary', null, 'qk-office-ai-menu-row');
          addLabel(summary, icon, label, true);
          submenu.append(summary);
          for (const [value, name] of choices) {
            const item = officeAIElement(doc, 'button', name);
            item.type = 'button';
            item.addEventListener('click', () => start(action, { [param]: value }));
            submenu.append(item);
          }
          menu.append(submenu);
        } else {
          const item = officeAIElement(doc, 'button', null, 'qk-office-ai-menu-row');
          addLabel(item, icon, label);
          item.type = 'button';
          item.addEventListener('click', () => start(action));
          menu.append(item);
        }
      }
      if (!cell) {
        const form = officeAIElement(doc, 'form');
        const input = officeAIElement(doc, 'input');
        input.placeholder = '问 AI…';
        input.setAttribute('aria-label', '问 AI');
        input.maxLength = 8000;
        input.required = true;
        form.append(input);
        form.addEventListener('submit', event => {
          event.preventDefault();
          if (input.value.trim()) start('ask', { instruction: input.value.trim() });
        });
        menu.append(form);
      }
    }
    // Preserve the editor's native selection when invoking an action with a mouse.
    menu.addEventListener('mousedown', event => {
      if (!event.target.closest('input')) event.preventDefault();
    });
    doc.body.append(menu);
    const bounds = button.getBoundingClientRect();
    positionOfficeAI(menu, bounds.left, bounds.bottom + 6);
    button.setAttribute('aria-expanded', 'true');
    if (focus) menu.querySelector('button')?.focus();
  }

  const offSection = floatToolbar.addSection('ai', container => {
    if (destroyed) return doc.createDocumentFragment();
    closeMenu();
    const button = officeAIElement(doc, 'button', 'AI ▾', 'qk-office-ai-trigger');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => toggle(button, false));
    trigger = button;
    if (container?.nodeType === 1) {
      container.append(button);
      return () => {
        if (trigger === button) { closeMenu(); trigger = undefined; }
        button.remove();
      };
    }
    return button;
  });
  function keydown(event) {
    if (event.key === 'Escape' && menu) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (!event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.repeat ||
        event.key.toLowerCase() !== 'j' || !trigger?.isConnected ||
        !trigger.getClientRects().length || !['cell', 'text'].includes(session.selection?.kind)) return;
    if (root && event.target !== doc.body && !root.contains(event.target) &&
        event.target !== trigger && event.target !== input && !menu?.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    toggle(trigger, true);
  }
  function outside(event) {
    if (menu && !menu.contains(event.target) && !trigger?.contains(event.target)) closeMenu();
  }
  doc.addEventListener('keydown', keydown, true);
  doc.addEventListener('pointerdown', outside, true);
  return {
    destroy() {
      destroyed = true;
      closeMenu();
      panel?.close(true);
      trigger?.remove();
      doc.removeEventListener('keydown', keydown, true);
      doc.removeEventListener('pointerdown', outside, true);
      if (typeof offSelection === 'function') offSelection();
      if (typeof offDirty === 'function') offDirty();
      if (typeof offSection === 'function') offSection();
    },
  };
}
