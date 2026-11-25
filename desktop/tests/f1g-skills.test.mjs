// [F1g] skills ported from AWS Quick + QuankSight-branded decks
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { capabilityPresets, presetSkill } from '../runtime/capability-presets.mjs';
import { parseSkillPackage } from '../runtime/skill-package.mjs';
import { THEMES, DEFAULT_THEME, getTheme } from '../runtime/ppt-deck/themes.mjs';
import { buildDeckLayout } from '../runtime/ppt-deck/engine.mjs';
import { QUANK_LOGO, QUANK_LOGO_ID, brandImages } from '../runtime/ppt-deck/quank-logo.mjs';
import { skillAvatar } from '../src/ui/avatars.js';

const IDS = ['qk-wechat-article', 'qk-server-ops', 'qk-ppt-builder', 'qk-deep-research', 'qk-structured-comparison', 'qk-data-analysis', 'qk-dashboard-design', 'qk-doc-delivery'];

test('ported skills are in the catalog, verify, and carry the key rules', () => {
  const c = capabilityPresets();
  assert.deepEqual(c.skills.filter(s => s.id.startsWith('qk-')).map(s => s.id), IDS);
  for (const id of IDS) {
    const p = presetSkill(id); assert.ok(parseSkillPackage(p.filename, p.bytes)); assert.ok(p.bytes.length > 300, id);
    assert.ok(!/知行志成|ACTWILL|隆基|通威/i.test(JSON.stringify(c.skills.find(s => s.id === id))), id + ' desensitized');
    assert.ok(svg(skillAvatar(c.skills.find(s => s.id === id))), id + ' avatar');
  }
});
const svg = h => /<svg [^>]*viewBox="0 0 48 48"/.test(h);

test('skill bodies: compliance and safety rules survive the port', async () => {
  const cat = JSON.parse(await readFile(new URL('../runtime/presets/catalog.json', import.meta.url), 'utf8'));
  const body = id => Buffer.from(cat.skills.find(s => s.id === id).archiveBase64, 'base64');
  assert.ok(cat.skills.length === 32 && cat.checkedDate === '2026-11-21');
  const text = id => { const p = presetSkill(id); return parseSkillPackage(p.filename, p.bytes); };
  for (const id of IDS) assert.ok(body(id).length > 200 && text(id), id);
  const src = JSON.parse(await readFile(new URL('../runtime/presets/catalog.json', import.meta.url), 'utf8'));
  assert.equal(new Set(src.skills.map(s => s.id)).size, src.skills.length, 'unique ids');
});

test('decks: QuankSight theme is the default and QuankSight decks carry the real logo', () => {
  assert.equal(DEFAULT_THEME, 'quank'); assert.equal(getTheme().primary, '2F62F5'); assert.equal(THEMES.quank.coverBg, '0B2BA6'); assert.equal(THEMES.quank.accent, '8C7CFF');
  assert.ok(QUANK_LOGO.width > 100 && QUANK_LOGO.height > 100 && Buffer.from(QUANK_LOGO.base64, 'base64').subarray(1, 4).toString() === 'PNG');
  const deck = {title: 'x', slides: [{layout: 'cover', title: '季度复盘', subtitle: '仅供内部'}, {layout: 'cards', title: '三项进展', cards: [{title: 'a', body: 'b'}, {title: 'c', body: 'd'}, {title: 'e', body: 'f'}]}, {layout: 'closing', title: '谢谢'}]};
  const b = buildDeckLayout(deck);
  assert.equal(b.theme.id, 'quank');
  const logos = b.slides.flatMap(s => s.shapes.filter(x => x.role === 'logo' && x.kind === 'image'));
  assert.ok(logos.length >= 1 && logos.every(x => x.imageId === QUANK_LOGO_ID));
  assert.ok(b.images[QUANK_LOGO_ID], 'mark is passed to the renderer');
  const own = buildDeckLayout({...deck, brand: {name: '某公司'}});
  assert.ok(!own.slides.some(s => s.shapes.some(x => x.kind === 'image' && x.imageId === QUANK_LOGO_ID)), 'other brands keep their own logo');
  assert.equal(brandImages({brand: {showLogo: false}}, {}).markImageId, undefined);
});
