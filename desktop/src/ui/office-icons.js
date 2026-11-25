const paths = {
  undo: 'M6 3 2.5 6.5 6 10M3 6.5h6.5a4 4 0 0 1 0 8H7',
  redo: 'm10 3 3.5 3.5L10 10m3-3.5H6.5a4 4 0 0 0 0 8H9',
  bold: 'M5 3h4a2.5 2.5 0 0 1 0 5H5m0 0h4.5a2.5 2.5 0 0 1 0 5H5V3',
  italic: 'M7 3h6M3 13h6m1-10-4 10',
  underline: 'M4 3v5a4 4 0 0 0 8 0V3M3 14h10',
  strike: 'M11.5 4.5C9.5 2 4.5 2.5 4.5 5c0 3 7 2 7 5.3 0 2.6-4.8 3.8-7 1.2M2 8h12',
  color: 'm4 11 4-8 4 8M5.4 8h5.2M3 14h10',
  highlight: 'm4 9 6-6 3 3-6 6H4zm0 3-2 2h12M8.5 4.5l3 3',
  font: 'M3 4h10M8 4v9M5.5 13h5',
  size: 'm2 12 3-7 3 7M3 10h4m3 2V8l2-2 2 2v4m-4-2h4',
  style: 'M2 4h12M2 8h8M2 12h10',
  left: 'M2 3h12M2 6.5h8M2 10h12M2 13.5h8',
  center: 'M2 3h12M4 6.5h8M2 10h12M4 13.5h8',
  right: 'M2 3h12M6 6.5h8M2 10h12M6 13.5h8',
  justify: 'M2 3h12M2 6.5h12M2 10h12M2 13.5h12',
  bullet: 'M6 3h8M6 8h8m-8 5h8M2 3h.5M2 8h.5M2 13h.5',
  numbering: 'M7 3h7M7 8h7m-7 5h7M2 2h1v3m-1 2h2v1l-2 2h2m-2 2h2v3H2m1-1.5h1',
  insert: 'M3 3h10v10H3zM5.5 8h5M8 5.5v5',
  table: 'M2 3h12v10H2zM2 7h12m-12 3h12M6 3v10m4-10v10',
  image: 'M2 3h12v10H2zm0 8 4-4 3 3 2-2 3 3M10.5 5.5h.5',
  chart: 'M3 2v11h11M6 10V7m3 3V4m3 6V6',
  comment: 'M2 3h12v8H7l-4 3v-3H2zM5 6h6M5 8.5h4',
  track: 'm3 10 7-7 3 3-7 7H3zm5.5-5.5 3 3M9 13h5',
  zoom: 'M7 2a5 5 0 1 0 0 10A5 5 0 0 0 7 2zm4 9 3 3M5 7h4M7 5v4',
  slide: 'M2 3h12v10H2zm3 5h6M8 5v6',
  layout: 'M2 3h12v10H2zm0 3h12M8 6v7',
  formula: 'M11 2H9L6 14H4M4 6h7',
  merge: 'M2 3h12v10H2zM3.5 8h3m-1.5-1.5L6.5 8 5 9.5m7.5-1.5h-3m1.5-1.5L9.5 8l1.5 1.5',
  border: 'M2 2h12v12H2zM8 2v12M2 8h12',
  fill: 'm3 7 5-5 5 5-5 5H7zM2 7h11m-7-5 2 2m5.5 5s-2 2-2 3a2 2 0 0 0 4 0c0-1-2-3-2-3z',
  sheet: 'M3 2h7l3 3v9H3zm7 0v4h3M5 9h6m-6 2.5h6',
  clear: 'm3 9 6-6 4 4-6 6H5zm2-2 5 4m-3 2h7',
  minus: 'M4 8h8',
  plus: 'M4 8h8M8 4v8',
  more: 'M3 8h.5m4.25 0h.5m4.25 0h.5',
  chevron: 'm5 6.5 3 3 3-3',
  ai: 'm8 2 1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z',
};

export function officeIcon(name) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  for (const [key, value] of Object.entries({
    width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  })) svg.setAttribute(key, value);
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}
