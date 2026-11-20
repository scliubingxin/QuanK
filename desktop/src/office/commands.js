// [lane:ribbon] bus `command` -> LibreOfficeKit UNO via the existing willbuddyOffice.invoke channel.
import {bus} from './bus.js';
import {validateUno, LEGACY_COMMANDS, mapUnoStates} from '../shared/office-uno.js';

/** mapUnoStates() keys -> ribbon item ids that show them as pressed. */
export const STATE_IDS = Object.freeze({
  bold: 'bold', italic: 'italic', underline: 'underline', strikeout: 'strike', superscript: 'superscript', subscript: 'subscript',
  left: 'align-left', center: 'align-center', right: 'align-right', justify: 'align-justify', bullet: 'bullets', numbering: 'numbering',
});

/** Decides how a `command` payload is executed. Throws on anything outside the whitelist. */
export function resolveCommand(detail, format) {
  if (!detail || typeof detail !== 'object') throw Error('命令无效');
  if (detail.action === 'pickImage') return {kind: 'pickImage'};
  const uno = detail.uno;
  if (LEGACY_COMMANDS.includes(uno)) return {kind: 'legacy', command: uno};
  const v = validateUno(uno, detail.args, {format});
  if (v.command === '.uno:InsertGraphic') throw Error('图片请通过选择文件插入');
  return {kind: 'uno', command: v.command, args: detail.args ?? null};
}
/** Converts a snapshot `states` dictionary to command:state payloads (only pressed/value fields). */
export function statePayloads(states) {
  const m = mapUnoStates(states), out = [];
  for (const [key, id] of Object.entries(STATE_IDS)) if (key in m.checked) out.push({id, checked: m.checked[key]});
  for (const [id, enabled] of Object.entries(m.enabled)) out.push({id, enabled});
  out.push({id: 'font-name', value: m.font}, {id: 'font-size', value: m.size});
  return out;
}

export function installCommands({host, api, bus: b = bus, say = () => {}} = {}) {
  if (!host || !api) return () => {};
  const format = () => host.info?.()?.format;
  const offCommand = b.on('command', detail => {
    let plan;
    try { plan = resolveCommand(detail, format()); } catch (error) { say(String(error.message || error)); return; }
    if (plan.kind === 'legacy') void host.perform('command', {command: plan.command});
    else if (plan.kind === 'uno') void host.perform('uno', {command: plan.command, args: plan.args});
    else if (plan.kind === 'pickImage') {
      void host.serial(async () => {
        const result = await api.invoke('pickImage');
        if (result?.status === 'cancelled') return;
        host.status(result); await host.draw();
      });
    }
  });
  let last = '';
  const offShot = b.on('office:shot', shot => {
    const key = JSON.stringify(shot?.states || {});
    if (key === last) return; last = key;
    for (const p of statePayloads(shot?.states)) b.emit('command:state', p);
  });
  return () => { offCommand(); offShot(); };
}

if (typeof window !== 'undefined' && window.willbuddyOffice) {
  const start = () => installCommands({
    host: window.wbOfficeHost, api: window.willbuddyOffice,
    say: text => { const s = document.getElementById('action-status'); if (s) s.textContent = text; },
  });
  if (window.wbOfficeHost) start(); else window.addEventListener('wb-office-host', start, {once: true});
}
