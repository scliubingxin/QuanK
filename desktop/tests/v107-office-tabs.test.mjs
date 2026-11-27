// [v1.0.7] Tabbed toolbar: every button command is valid for its document format.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeToolbarTabs} from '../src/shared/office-ribbon-native.js';
import {validateUno, LEGACY_COMMANDS} from '../src/shared/office-uno.js';

const FORMAT = {writer: 'docx', impress: 'pptx', calc: 'xlsx'};
const SPECIAL = new Set([...LEGACY_COMMANDS, '.uno:TrackChanges']);
const commands = items => items.flatMap(item => item.type === 'menu' ? commands(item.items) : item.cmd ? [item] : []);

for (const kind of ['writer', 'impress', 'calc']) {
  test(`${kind}: every command passes the engine whitelist for ${FORMAT[kind]}`, () => {
    for (const tab of nativeToolbarTabs(kind)) for (const group of tab.groups) for (const item of commands(group.items)) {
      if (SPECIAL.has(item.cmd)) continue;
      assert.doesNotThrow(() => validateUno(item.cmd, item.args, {format: FORMAT[kind]}), `${kind} ${tab.label} ${item.label} ${item.cmd}`);
    }
  });
}

test('tabs per document type', () => {
  assert.deepEqual(nativeToolbarTabs('writer').map(t => t.label), ['开始', '插入', '设计', '视图']);
  assert.deepEqual(nativeToolbarTabs('impress').map(t => t.label), ['开始', '插入', '设计', '视图']);
  assert.deepEqual(nativeToolbarTabs('calc').map(t => t.label), ['开始', '插入', '数据', '视图']);
});

test('the PPT insert tab offers a new slide and the Word insert tab offers a table', () => {
  const find = (kind, id) => nativeToolbarTabs(kind).find(t => t.id === id).groups.flatMap(g => g.items);
  assert.ok(find('impress', 'insert').some(i => i.cmd === '.uno:InsertPage'));
  assert.ok(find('writer', 'insert').some(i => i.type === 'table'));
  assert.ok(!find('impress', 'insert').some(i => i.type === 'table'), 'the engine only inserts tables into Word');
});

test('the edit window passes zoom controls and the toolbar shows one tab at a time', () => {
  assert.match(readFileSync(new URL('../src/office/window.js', import.meta.url), 'utf8'), /view:\{zoomBy:direction => canvas\.zoomBy\(direction\)/);
  const tb = readFileSync(new URL('../src/ui/office-toolbar.js', import.meta.url), 'utf8');
  assert.match(tb, /if \(tab !== activeTab\) \{ el\.remove\(\); continue; \}/);
  assert.match(tb, /args: \{ Style: value, FamilyName: 'ParagraphStyles' \}/);
});
