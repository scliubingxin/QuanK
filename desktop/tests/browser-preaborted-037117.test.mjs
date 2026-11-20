import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserService} from '../runtime/browser.mjs';

function setup() {
  let executions = 0;
  const url = 'https://example.test/';
  const contents = {
    getURL: () => url,
    executeJavaScript: async () => { executions++; return 'private'; },
    executeJavaScriptInIsolatedWorld: async () => { executions++; return {url, elements: []}; },
  };
  const browser = new BrowserService({});
  browser.windows.set('w', {isDestroyed: () => false, getTitle: () => '', webContents: contents});
  const snapshot = {id: 'old', url, createdAt: Date.now()};
  browser.states.set('w', {epoch: 3, key: 'key', snapshot});
  const controller = new AbortController();
  controller.abort(new Error('already stopped'));
  return {browser, contents, controller, snapshot, executions: () => executions};
}

test('pre-cancelled read and DOM operation never invoke the page', async () => {
  const f = setup();
  await assert.rejects(f.browser.read('w', f.controller.signal), /already stopped/);
  await assert.rejects(f.browser.dom('w', () => {}, {operation: 'focus'}, f.controller.signal), /already stopped/);
  assert.equal(f.executions(), 0);
});

test('pre-cancelled snapshot and preparation do not alter the existing snapshot or issue credentials', async () => {
  const f = setup();
  await assert.rejects(f.browser.snapshot('w', f.controller.signal), /already stopped/);
  await assert.rejects(f.browser.prepareAction('browser_fill', {id:'w', snapshotId:'old', ref:'e1', text:'x'}, f.controller.signal), /already stopped/);
  assert.equal(f.executions(), 0);
  assert.equal(f.browser.states.get('w').snapshot, f.snapshot);
  assert.equal(f.browser.states.get('w').epoch, 3);
  assert.equal(f.browser.prepared.size, 0);
});

test('cancellation during URL validation prevents subsequent page read or focus', async () => {
  for (const operation of ['read', 'dom']) {
    const f = setup();
    const controller = new AbortController();
    f.contents.getURL = () => { controller.abort(new Error('stopped during validation')); return 'https://example.test/'; };
    const promise = operation === 'read' ? f.browser.read('w', controller.signal) : f.browser.dom('w', () => {}, {operation:'focus'}, controller.signal);
    await assert.rejects(promise, /stopped during validation/);
    assert.equal(f.executions(), 0);
  }
});
