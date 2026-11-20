// desktop/src/office/bus.js — shared event bus (do not modify without updating CONTRACT.md)
const listeners = new Map();
export const bus = {
  on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type)?.delete(fn); },
  emit(type, detail) { for (const fn of listeners.get(type) || []) { try { fn(detail); } catch (error) { console.error('[bus]', type, error); } } },
};
if (typeof window !== 'undefined') window.wbBus = bus;
