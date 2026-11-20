// 导出 runtime/ppt-themes.json（供 ribbon「美化」配色使用）。用法：node scripts/gen-ppt-themes.mjs [--check]
import { writeFileSync, readFileSync } from 'node:fs';
import { THEMES, FONT, DEFAULT_THEME, GRID, TYPE } from '../runtime/ppt-deck/themes.mjs';
const data = { version: 1, default: DEFAULT_THEME, font: FONT, slide: { widthIn: GRID.W, heightIn: GRID.H }, roles: ['primary', 'accent', 'light', 'bg', 'coverBg', 'text', 'muted', 'border', 'onPrimary', 'series'], themes: Object.values(THEMES).map(({ id, name, dark, preview, ...colors }) => ({ id, name, dark, preview, colors: Object.fromEntries(Object.entries(colors).filter(([k]) => k !== 'font')) })) };
const out = JSON.stringify(data, null, 2) + '\n', file = new URL('../runtime/ppt-themes.json', import.meta.url);
if (process.argv.includes('--check')) { if (readFileSync(file, 'utf8') !== out) { console.error('ppt-themes.json 已过期，请运行 node scripts/gen-ppt-themes.mjs'); process.exit(1); } } else writeFileSync(file, out);
