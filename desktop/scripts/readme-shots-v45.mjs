// [v45] README screenshots for QuanK 0.45 (demo data). Run from desktop/: CHROME_PATH=<Chrome> node scripts/readme-shots-v45.mjs [outDir]
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openDemo} from './demo-harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] || path.join(here, '../../docs/images'));
await mkdir(outDir, {recursive: true});
const {page, nav, errors, close} = await openDemo({width: 1440, height: 900, scale: 2});
const shots = [];
const shot = async (name, prep) => { await prep(); await page.waitForTimeout(500); await page.screenshot({path: path.join(outDir, name)}); shots.push(name); };
const top = () => page.evaluate(() => document.querySelector('.workspace')?.scrollTo(0, 0));
try {
  await shot('app-home.png', async () => { await nav('home'); await top(); });
  await shot('app-home-cards.png', async () => { await page.evaluate(() => document.querySelector('.qk-grid')?.scrollIntoView({block: 'start'})); });
  await shot('app-chat-research.png', async () => { await page.click('[data-action="openChat"][data-id="c-fin"]'); await page.evaluate(() => { const s = document.querySelector('.messages-scroll'); if (s) s.scrollTop = 0; }); });
  await shot('app-quant.png', async () => { await nav('home'); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('.home-quant [data-action="quantHome"]')?.click()); await page.waitForTimeout(500); await top(); });
  await shot('app-quant-holdings.png', async () => { await page.evaluate(() => document.querySelector('.q-holdings')?.scrollIntoView({block: 'start'})); });
  await shot('app-quant-detail.png', async () => { await page.click('[data-action="quantOpen"][data-id="600519"]'); await page.waitForSelector('.q-hero'); await page.waitForTimeout(2500); });
  await page.click('[data-action="quantClose"]');
  await shot('app-agents.png', async () => { await nav('agents'); await top(); });
  await shot('app-skills.png', async () => { await page.click('[data-action="capabilityTab"][data-id="skills"]'); await top(); });
  await shot('app-mcp.png', async () => { await page.click('[data-action="capabilityTab"][data-id="mcp"]'); await top(); });
  await page.click('[data-action="capabilityTab"][data-id="agents"]');
  await shot('app-tasks.png', async () => { await nav('tasks'); await top(); });
  await shot('app-feed.png', async () => { await nav('feed'); await top(); });
  await shot('app-research-report.png', async () => { await page.click('[data-action="openChat"][data-id="c-research"]'); await page.evaluate(() => { const s = document.querySelector('.messages-scroll'); if (s) s.scrollTop = s.scrollHeight; }); });
  await shot('app-plan.png', async () => { await page.click('[data-action="openChat"][data-id="c-plan"]'); });
  await shot('app-memory.png', async () => { await page.click('[data-action="openChat"][data-id="c-mem"]'); await page.evaluate(() => document.querySelectorAll('details.memory-sources').forEach(d => d.open = true)); });
  await shot('app-graph.png', async () => { await nav('graph'); await page.waitForTimeout(2800); }); // [v45k]
  await shot('app-memory-page.png', async () => { await nav('context'); await top(); });
  await shot('app-infographic.png', async () => { await nav('studio'); await page.click('[data-action="studioTab"][data-id="infographics"]'); await page.waitForTimeout(700); });
  await shot('app-miniapps.png', async () => { await page.click('[data-action="studioTab"][data-id="miniapps"]'); });
  await page.setViewportSize({width: 900, height: 900});
  await shot('app-narrow.png', async () => { await nav('home'); await top(); });
  console.log('V45-SHOTS ' + JSON.stringify({outDir, shots, errors}));
} finally { await close(); }
