// Inline line icons (24 viewBox, 1.5px stroke, rendered at 20px). No external assets: Electron runs offline under a strict CSP.
const P = {
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><path d="M8 20v-6h8v6"/>',
  'cloud-up': '<path d="M7.5 18.5a4 4 0 0 1-.7-7.9A5.5 5.5 0 0 1 17.3 9.2a4.7 4.7 0 0 1 .2 9.3"/><path d="M12 19v-7"/><path d="M9.5 14.2 12 11.7l2.5 2.5"/>',
  'play-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M10.5 9v6l5-3z"/>',
  share: '<path d="M14 5l6 5.5-6 5.5v-3.2c-5 0-8 1.4-10 5.7.4-5.6 3.2-9.4 10-9.4z"/>',
  more: '<circle cx="5.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>',
  ai: '<rect x="4" y="7.5" width="16" height="11.5" rx="4"/><path d="M12 7.5V4.5"/><circle cx="9" cy="13" r=".9"/><circle cx="15" cy="13" r=".9"/><path d="M2.5 12.5v2M21.5 12.5v2"/>',
  folder: '<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  'save-as': '<path d="M12.5 20H6.5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2H16l3.5 3.5V12"/><path d="M8 4v4h6"/><path d="M15 18.5h6M18.5 16l2.5 2.5-2.5 2.5"/>',
  'file-cog': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13.5h6M9 17h4"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7"/><path d="M7 7l.8 12.5h8.4L17 7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
  'chevron-up': '<path d="M6 14.5l6-6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  'plus-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  outline: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  'view-normal': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/>',
  'view-notes': '<path d="M4.5 6h15M4.5 10h15M8 14.5h8"/><path d="M4.5 18.5h15"/>',
  fit: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><rect x="8.5" y="9" width="7" height="6" rx="1"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  'free-select': '<path d="M13 4.5H6.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2H11"/><path d="M12 11.5l7 3-3 1.2-1.2 3z"/>',
  sparkle: '<path d="M12 4l1.8 4.7 4.7 1.8-4.7 1.8L12 17l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M18.5 16.5v3M17 18h3"/>',
  edit: '<path d="M5 19l1-4L16.5 4.5a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L9 18z"/><path d="M14.5 6.5l3 3"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.7a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.8"/><path d="M12 16.8v.2"/>',
};
export function icon(name, size = 20) {
  const body = P[name];
  if (!body) return '';
  return `<svg class="wb-i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (el.dataset.iconDone) continue;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, Number(el.dataset.iconSize) || 20));
    el.dataset.iconDone = '1';
  }
}
export const iconNames = Object.keys(P);
