import { setTimeout as delay } from 'node:timers/promises';
import { startOfficeKit } from '../../runtime/office-kit.mjs';

export const officeColdStartMs = 90_000;

export function startLiveOfficeKit(options) {
  return startOfficeKit({ ...options, startupTimeoutMs: officeColdStartMs });
}

export async function openLibrary(page) {
  const expand = page.getByRole('button', { name: '展开侧栏', exact: true });
  await page.locator('[data-action="sidebarToggle"]').waitFor();
  if (await expand.isVisible()) await expand.click();
  const group = page.locator('[data-group="library"]');
  await group.locator('button[aria-haspopup="menu"]').focus();
  await group.getByRole('menuitem').and(page.locator('[data-page="library"]')).click();
}

export function officeCanvas(page) {
  return page.getByLabel('Office文档编辑画布', { exact: true });
}

export async function waitForOfficePaint(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[aria-label="Office文档编辑画布"]');
    if (!canvas) return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 100) return true;
    }
    return false;
  });
}

export async function focusWordInput(page) {
  await officeCanvas(page).focus();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '文档输入');
  return page.getByRole('textbox', { name: '文档输入', exact: true });
}

export async function selectWordDocument(page) {
  await (await focusWordInput(page)).press('ControlOrMeta+a');
}

export async function pasteWordText(page, text) {
  const input = page.getByRole('textbox', { name: '文档输入', exact: true });
  await input.evaluate((element, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', value);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, text);
}

export async function selectSheetRange(page, ref) {
  const nameBox = page.getByRole('textbox', { name: '名称框', exact: true });
  await nameBox.fill(ref);
  await nameBox.press('Enter');
}

export async function waitForHostState(predicate, description, timeout = 15_000) {
  const deadline = performance.now() + timeout;
  do {
    if (await predicate()) return;
    await delay(25);
  } while (performance.now() < deadline);
  throw new Error('Timed out waiting for ' + description);
}

// The PPT fixtures have a dark title on a white first slide. Find the title
// on the actual tile so the click follows fit zoom and viewport dimensions.
export async function openSlideTitle(page) {
  const canvas = officeCanvas(page);
  const title = await canvas.evaluate(element => {
    const { width, height } = element;
    const pixels = element.getContext('2d').getImageData(0, 0, width, height).data;
    const bounds = { left: width, right: 0, top: -1, bottom: -1 };
    for (let y = Math.floor(height * 0.06); y < height * 0.35; y++) {
      const ink = [];
      for (let x = Math.floor(width * 0.03); x < width * 0.85; x++) {
        const i = (y * width + x) * 4;
        if (pixels[i + 3] > 200 && (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 < 170) ink.push(x);
      }
      if (ink.length < 3) {
        if (bounds.top >= 0) break;
        continue;
      }
      if (bounds.top < 0) bounds.top = y;
      bounds.bottom = y;
      bounds.left = Math.min(bounds.left, ink[0]);
      bounds.right = Math.max(bounds.right, ink.at(-1));
    }
    if (bounds.top < 0) return null;
    return {
      x: (bounds.left + (bounds.right - bounds.left) / 4) * element.clientWidth / width,
      y: ((bounds.top + bounds.bottom) / 2) * element.clientHeight / height,
    };
  });
  if (!title) throw new Error('The first slide has no visible title ink');
  await canvas.dblclick({ position: title });
}
