// [v1.0.8] The app's line-icon set (24 × 24, stroked with currentColor; the global svg rule draws them).
// Shared by the main window and the right-hand panel pages so every icon has the same weight and size.
export const iconPaths = {
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z', chat: 'M5 4h14v12H9l-4 4Z', folder: 'M3 7V5h6l2 3h10v12H3Z',
  grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z', agent: 'M5 7h14v13H5ZM12 3v4M8 12h1m6 0h1m-7 4h6',
  clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  search: 'M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm6-2 6 6', plus: 'M12 5v14M5 12h14', arrow: 'M5 12h14m-5-5 5 5-5 5',
  up: 'M12 20V4m-6 6 6-6 6 6', file: 'M5 3h9l5 5v13H5Zm9 0v6h5M8 13h8m-8 4h6',
  link: 'm9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 8a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1',
  check: 'm5 12 4 4L19 6', close: 'm5 5 14 14M5 19 19 5', activity: 'M3 12h4l3-8 4 16 3-8h4', trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  fileDown: 'M5 3h9l5 5v13H5Zm9 0v5h5m-7 3v7m-3-3 3 3 3-3', download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z', stop: 'M6 6h12v12H6Z',
  // [v1.0.8] additions in the same style
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 16a2 2 0 0 1 2-2h13', edit: 'M4 20h4L19 9l-4-4L4 16Zm9-13 4 4',
  flask: 'M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10',
  merge: 'M6 3v12a6 6 0 0 0 6 6h6M6 3a2 2 0 1 0 0 .01M18 21a2 2 0 1 0 0-.01M6 8a8 8 0 0 0 8 7',
  branch: 'M6 3v18M6 9a6 6 0 0 0 6 6h3m3 0a2 2 0 1 1 0 .01M6 3a2 2 0 1 0 0 .01',
  terminal: 'M3 5h18v14H3Zm4 4 3 3-3 3m5 0h5', copy: 'M9 9h11v11H9ZM5 15H4V4h11v1',
  lock: 'M6 11h12v9H6Zm2.5 0V8a3.5 3.5 0 0 1 7 0v3', globe: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-9-9h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18',
  alert: 'M12 4 2 20h20Zm0 6v4m0 3v.01', dot: 'M12 12h.01',
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[name] || iconPaths.spark}"/></svg>`;
