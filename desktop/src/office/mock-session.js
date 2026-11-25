import { UNO } from './session-types.js';

const alignment = [UNO.LeftPara, UNO.CenterPara, UNO.RightPara, UNO.JustifyPara];
const lists = [UNO.DefaultBullet, UNO.DefaultNumbering];
const formats = [UNO.NumberFormatStandard, UNO.NumberFormatDecimal, UNO.NumberFormatPercent, UNO.NumberFormatCurrency, UNO.NumberFormatDate];
const exclusive = [alignment, lists, formats];
const toggles = [
  UNO.Bold, UNO.Italic, UNO.Underline, UNO.Strikeout, UNO.TrackChanges,
  UNO.ToggleMergeCells, ...exclusive.flat(),
];
const attributes = {
  [UNO.Color]: 'Color',
  [UNO.CharBackColor]: 'CharBackColor',
  [UNO.BackgroundColor]: 'BackgroundColor',
  [UNO.SetBorderStyle]: 'preset',
  [UNO.FontHeight]: 'FontHeight',
  [UNO.CharFontName]: 'CharFontName',
  [UNO.StyleApply]: 'Style',
  [UNO.Zoom]: 'Zoom',
  [UNO.AssignLayout]: 'Layout',
};

function commandState({ enabled = true, checked = false, value = null } = {}) {
  return { enabled, checked, value };
}

export function createMockSession({
  docId = 'mock-office', kind = 'writer', readOnly = false, state,
  selection, toScreen = ({ x, y, w, h }) => ({ x: x / 15, y: y / 15, w: w / 15, h: h / 15 }),
  context = {}, clock = Date.now,
} = {}) {
  const events = new Map();
  const defaults = new Map(Object.values(UNO).map(command => [command, commandState()]));
  defaults.set(UNO.FontHeight, commandState({ value: 12 }));
  defaults.set(UNO.CharFontName, commandState({ value: 'Arial' }));
  defaults.set(UNO.StyleApply, commandState({ value: 'Text Body' }));
  defaults.set(UNO.Zoom, commandState({ value: 100 }));
  defaults.set(UNO.LeftPara, commandState({ checked: true }));
  defaults.set(UNO.NumberFormatStandard, commandState({ checked: true }));
  defaults.set(UNO.Undo, commandState({ enabled: false }));
  defaults.set(UNO.Redo, commandState({ enabled: false }));
  const undoStack = [];
  const redoStack = [];
  const changes = new Map();
  let nextChange = 0;
  let nextSelection = 0;
  let directlyAcceptable;

  function emit(event, payload) {
    for (const listener of [...(events.get(event) ?? [])]) listener(payload);
  }

  function selectionWithToken(value) {
    return { kind: 'none', text: '', rects: [], ...value, token: docId + ':' + ++nextSelection };
  }

  function updateState(command, patch) {
    session.state.set(command, commandState({ ...session.state.get(command), ...patch }));
  }

  function writable() {
    if (session.readOnly) throw new Error('只读');
  }

  function snapshot() {
    return { state: new Map(session.state), selection: session.selection, changes: new Map(changes) };
  }

  function beginEdit() {
    writable();
    directlyAcceptable = undefined;
    undoStack.push(snapshot());
    redoStack.length = 0;
  }

  function publish() {
    updateState(UNO.Undo, { enabled: undoStack.length > 0 });
    updateState(UNO.Redo, { enabled: redoStack.length > 0 });
    emit('state', session.state);
    emit('dirty', { docId });
  }

  function travel(from, to) {
    writable();
    const entry = from.pop();
    if (!entry) return;
    directlyAcceptable = undefined;
    to.push(snapshot());
    session.state = entry.state;
    session.setSelection(entry.selection);
    changes.clear();
    for (const [id, change] of entry.changes) changes.set(id, change);
    emit('changes', [...changes.values()]);
    publish();
  }

  function resolveChanges(ids, reject) {
    writable();
    const pending = ids.map(id => changes.get(id)).filter(Boolean);
    if (!pending.length) return;
    const mergesWithReplacement = !reject && pending.length === 1 && pending[0].id === directlyAcceptable;
    if (mergesWithReplacement) directlyAcceptable = undefined;
    else beginEdit();
    for (const change of pending) {
      if (reject && session.selection.text === change.after) {
        session.setSelection({ ...session.selection, text: change.before });
      }
      changes.delete(change.id);
    }
    emit('changes', [...changes.values()]);
    publish();
  }

  const session = {
    docId, kind, readOnly, toScreen,
    state: new Map([...defaults, ...Array.from(state ?? [], ([command, value]) => [
      command, commandState({ ...defaults.get(command), ...value }),
    ])]),
    selection: selectionWithToken(selection),
    calls: [],
    on(event, listener) {
      if (!events.has(event)) events.set(event, new Set());
      const listeners = events.get(event);
      listeners.add(listener);
      return () => session.off(event, listener);
    },
    off(event, listener) {
      events.get(event)?.delete(listener);
    },
    emit,
    setState(command, value) {
      updateState(command, value);
      emit('state', session.state);
    },
    setReadOnly(value) {
      session.readOnly = value;
      emit('state', session.state);
    },
    setSelection(value) {
      session.selection = selectionWithToken(value);
      emit('selection', session.selection);
    },
    async uno(command, args) {
      writable();
      if (session.state.get(command)?.enabled === false) return;
      session.calls.push({ command, args });
      if (command === UNO.Undo) return session.undo();
      if (command === UNO.Redo) return session.redo();
      if (command === UNO.Zoom) {
        session.setState(command, { value: args.Zoom });
        return;
      }
      beginEdit();
      if (command === UNO.NumberFormatIncDecimals || command === UNO.NumberFormatDecDecimals) {
        const delta = command === UNO.NumberFormatIncDecimals ? 1 : -1;
        const decimals = session.state.get(UNO.NumberFormatIncDecimals).value ?? 2;
        const value = Math.max(0, decimals + delta);
        updateState(UNO.NumberFormatIncDecimals, { value });
        updateState(UNO.NumberFormatDecDecimals, { value });
      } else if (toggles.includes(command)) {
        const group = exclusive.find(items => items.includes(command));
        const checked = session.state.get(command)?.checked;
        const on = alignment.includes(command) || formats.includes(command)
          || !checked;
        for (const other of group ?? []) updateState(other, { checked: false });
        updateState(command, { checked: on });
      } else if (attributes[command] && args?.[attributes[command]] != null) {
        updateState(command, { value: args[attributes[command]] });
      } else if (command === UNO.ResetAttributes) {
        for (const key of [UNO.Bold, UNO.Italic, UNO.Underline, UNO.Strikeout, UNO.Color,
          UNO.CharBackColor, UNO.BackgroundColor, UNO.SetBorderStyle, UNO.FontHeight, UNO.CharFontName,
          ...formats, UNO.NumberFormatIncDecimals, UNO.NumberFormatDecDecimals]) {
          const { checked, value } = defaults.get(key);
          updateState(key, { checked, value });
        }
      }
      publish();
    },
    async getSelection({ context: count = 0 } = {}) {
      return {
        text: session.selection.text,
        before: count ? (context.before ?? []).slice(-count) : [],
        after: (context.after ?? []).slice(0, count),
        style: session.state.get(UNO.StyleApply)?.value ?? '',
        token: session.selection.token,
      };
    },
    async replaceSelection(text, { track = false, token, accept = false } = {}) {
      if (token !== session.selection.token) return { ok: false, reason: 'selection_changed' };
      beginEdit();
      const before = session.selection.text;
      const changeId = track ? String(++nextChange) : null;
      const changeset = track ? { id: changeId, before, after: text } : null;
      if (changeset && !accept) {
        changes.set(changeId, changeset);
        directlyAcceptable = changeId;
      }
      session.setSelection({ ...session.selection, text });
      if (changeset) emit('changes', [...changes.values()]);
      publish();
      return { ok: true, changeId, changeset };
    },
    async setTrackChanges(on) {
      if (session.state.get(UNO.TrackChanges).checked !== on) await session.uno(UNO.TrackChanges);
    },
    async acceptAll() { resolveChanges([...changes.keys()], false); },
    async rejectAll() { resolveChanges([...changes.keys()].reverse(), true); },
    async acceptChange(id) { resolveChanges([id], false); },
    async rejectChange(id) { resolveChanges([id], true); },
    async undo() { travel(undoStack, redoStack); },
    async redo() { travel(redoStack, undoStack); },
    async save({ reason, mode = 'file' }) {
      writable();
      if (mode === 'snapshot') return new TextEncoder().encode(session.selection.text);
      emit('saving', { docId, reason });
      const result = { docId, reason, at: clock() };
      emit('saved', result);
      return result;
    },
  };
  return session;
}
