import { escape } from './markdown.js';

export const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm6-2 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export function searchField(id, label, value) {
  return `<label class="graph-search">${searchIcon}<input id="${id}" type="search" aria-label="${label}" placeholder="${label}" value="${escape(value)}" autocomplete="off"></label>`;
}
