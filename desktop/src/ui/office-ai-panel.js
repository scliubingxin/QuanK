// [v1.0.7] Right-hand 「AI 对话」 panel of the Office edit window: questions about the whole document
// (summary, speaker notes, logic check, free questions) and a one-click 「优化选中文字」 that reuses the
// selection-AI diff → confirm flow. Answers never write into the document by themselves.
const CSS = `
.qk-ai-panel{position:fixed;right:0;width:360px;display:flex;flex-direction:column;background:#fff;border-left:1px solid #e2e6f2;box-shadow:-8px 0 24px -18px #1e2a5555;z-index:40;font:13px/1.6 -apple-system,"PingFang SC",sans-serif;color:#1f2a44}
.qk-ai-panel[hidden]{display:none}
.qk-ai-panel header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #eef1f7;font-weight:600}
.qk-ai-panel header button{margin-left:auto;border:0;background:none;font-size:16px;color:#7a85a3;cursor:pointer}
.qk-ai-quick{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px}
.qk-ai-quick button{border:1px solid #dbe2f5;background:#f6f8ff;border-radius:999px;padding:4px 11px;font-size:12.5px;color:#2f62f5;cursor:pointer}
.qk-ai-quick button:disabled{opacity:.5;cursor:default}
.qk-ai-log{flex:1;overflow:auto;padding:6px 14px 10px;display:flex;flex-direction:column;gap:10px}
.qk-ai-msg{border-radius:12px;padding:9px 12px;white-space:pre-wrap;word-break:break-word}
.qk-ai-msg.user{align-self:flex-end;background:#2f62f5;color:#fff;max-width:85%}
.qk-ai-msg.assistant{background:#f4f6fb}
.qk-ai-msg.error{background:#fff1f1;color:#b42318}
.qk-ai-msg .qk-ai-copy{display:block;margin-top:6px;border:0;background:none;color:#2f62f5;font-size:12px;cursor:pointer;padding:0}
.qk-ai-empty{color:#7a85a3;font-size:12.5px;padding:4px 0}
.qk-ai-form{display:flex;gap:8px;padding:10px 14px 14px;border-top:1px solid #eef1f7}
.qk-ai-form textarea{flex:1;resize:none;height:56px;border:1px solid #dbe2f5;border-radius:10px;padding:7px 9px;font:inherit}
.qk-ai-form button{align-self:flex-end;border:0;border-radius:10px;background:#2f62f5;color:#fff;padding:7px 14px;cursor:pointer}
.qk-ai-form button:disabled{opacity:.5}
.qk-ai-toggle{-webkit-app-region:no-drag;margin-left:auto;border:1px solid #dbe2f5;background:#fff;border-radius:8px;padding:3px 10px;font-size:12.5px;color:#1f2a44;cursor:pointer}
.qk-ai-toggle[aria-pressed="true"]{background:#1f2a44;color:#fff;border-color:#1f2a44}
.qk-ai-open .qk-win-host{margin-right:360px}
.qk-ai-note{color:#7a85a3;font-size:11.5px;padding:0 14px 8px}
@media (prefers-color-scheme: dark){.qk-ai-panel{background:#171f35;color:#f0f3ff;border-color:#36425f}.qk-ai-msg.assistant{background:#222b45}.qk-ai-quick button{background:#222b45;border-color:#36425f;color:#a7baff}}
`;

export const OFFICE_AI_QUICK = Object.freeze([
  ['summarize', '总结要点'],
  ['speech', '生成演讲稿'],
  ['logic', '检查逻辑结构'],
  ['polish', '优化选中文字'],
]);

function el(doc, tag, cls, text) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export function mountOfficeAIPanel({doc = document, head, toolbar, ai, kind, documentId, session, polish}) {
  if (!doc.getElementById('qk-ai-panel-css')) {
    const style = el(doc, 'style'); style.id = 'qk-ai-panel-css'; style.textContent = CSS; doc.head.append(style);
  }
  const panel = el(doc, 'aside', 'qk-ai-panel'); panel.hidden = true;
  panel.setAttribute('aria-label', 'AI 对话');
  const top = el(doc, 'header'); top.append(el(doc, 'span', '', 'AI 对话'));
  const close = el(doc, 'button', '', '×'); close.type = 'button'; close.setAttribute('aria-label', '关闭 AI 对话');
  top.append(close);
  const quick = el(doc, 'div', 'qk-ai-quick');
  const note = el(doc, 'p', 'qk-ai-note', '基于文档最近保存的内容回答；修改文字会先给出对比，确认后才写入。');
  const log = el(doc, 'div', 'qk-ai-log');
  log.append(el(doc, 'p', 'qk-ai-empty', '可以问：这页想表达什么？数据有没有前后矛盾？'));
  const form = el(doc, 'form', 'qk-ai-form');
  const input = el(doc, 'textarea'); input.placeholder = '问 AI 关于这份文档的问题…'; input.maxLength = 8000;
  input.setAttribute('aria-label', 'AI 对话输入');
  const send = el(doc, 'button', '', '发送'); send.type = 'submit';
  form.append(input, send);
  panel.append(top, quick, note, log, form);
  doc.body.append(panel);

  const toggle = el(doc, 'button', 'qk-ai-toggle', 'AI 对话'); toggle.type = 'button';
  toggle.setAttribute('aria-pressed', 'false');
  head?.append(toggle);

  let busy = false, controller;
  const blocked = () => ai.blockReason?.() || '';
  function place() {
    const t = Math.round(toolbar?.getBoundingClientRect?.().bottom || 96);
    panel.style.top = t + 'px';
    panel.style.bottom = '28px';
  }
  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-pressed', String(open));
    doc.body.classList.toggle('qk-ai-open', open);
    if (open) { place(); input.focus(); }
    doc.defaultView?.dispatchEvent(new Event('resize'));
  }
  function add(role, text) {
    log.querySelector('.qk-ai-empty')?.remove();
    const m = el(doc, 'div', 'qk-ai-msg ' + role, text);
    log.append(m); log.scrollTop = log.scrollHeight;
    return m;
  }
  function setBusy(on) {
    busy = on;
    send.disabled = on;
    for (const b of quick.querySelectorAll('button')) b.disabled = on;
    send.textContent = on ? '生成中…' : '发送';
  }
  async function ask(action, label, instruction) {
    if (busy) return;
    const reason = blocked();
    if (reason) { add('assistant error', reason); return; }
    add('user', label);
    const out = add('assistant', '正在阅读文档…');
    setBusy(true);
    controller = new AbortController();
    let streamed = '';
    try {
      const result = await ai.run({action, kind, documentId, instruction}, {
        signal: controller.signal,
        onDelta(delta) { streamed += delta; out.textContent = streamed; log.scrollTop = log.scrollHeight; },
      });
      out.textContent = result?.text || streamed || '（没有返回内容）';
      const copy = el(doc, 'button', 'qk-ai-copy', '复制');
      copy.type = 'button';
      copy.addEventListener('click', () => {
        void doc.defaultView?.navigator?.clipboard?.writeText(out.firstChild?.textContent || '').then(() => { copy.textContent = '已复制'; });
      });
      out.append(copy);
    } catch (error) {
      out.className = 'qk-ai-msg assistant error';
      out.textContent = error?.message || String(error);
    } finally { setBusy(false); controller = undefined; }
  }
  for (const [action, label] of OFFICE_AI_QUICK) {
    const b = el(doc, 'button', '', label); b.type = 'button';
    b.addEventListener('click', () => {
      if (action !== 'polish') return void ask(action, label);
      const sel = session?.selection;
      if (!(sel?.kind === 'text' && sel.text && sel.rects?.length)) { add('assistant', '请先在文档里选中要优化的文字，再点「优化选中文字」。'); return; }
      try { polish?.(); add('assistant', '已在选中文字旁给出优化对比，确认后才会写入文档。'); }
      catch (error) { add('assistant error', error?.message || String(error)); }
    });
    quick.append(b);
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    void ask('doc_ask', text, text);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
  });
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  doc.defaultView?.addEventListener('resize', () => { if (!panel.hidden) place(); });
  return {
    element: panel, toggle, open: () => setOpen(true), close: () => setOpen(false), ask,
    destroy() { controller?.abort(); panel.remove(); toggle.remove(); doc.body.classList.remove('qk-ai-open'); },
  };
}
