import {escape, extractHtml, rich} from './markdown.js';
import {searchField, searchIcon} from './search-field.js';
import {mountHtmlPreview} from './html-preview.js';
import {OFFICE_PREVIEW_TIMEOUT_MS} from '../shared/office-timeouts.js';

/** Revision-bound bridge. Fixed app resource route in installed file:// builds. */
export function mountOfficePreview(host, invoke, engineReady = () => false, panel) {
  const doc = host.ownerDocument,
    win = doc.defaultView;
  let stop = () => {};
  function start() {
    stop();
    const token = win.crypto.randomUUID(),
      iframe = doc.createElement("iframe"),
      note = doc.createElement("p");
    iframe.title = "Office 文档预览";
    iframe.className = "office-frame";
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.referrerPolicy = "no-referrer";
    note.className = "preview-loading";
    note.textContent = "正在准备预览…";
    if (win.getComputedStyle(host).position === "static") host.style.position = "relative"; // [p2-ux] overlay loader
    let sent = false,
      disposed = false,
      timer, snapshot;
    const finish = () => {
      win.clearTimeout(timer);
      win.removeEventListener("message", listener);
    };
    const fail = (message) => {
      if (disposed) return;
      disposed = true;
      finish();
      if (!host.isConnected) return;
      const p = doc.createElement("p"),
        retry = doc.createElement("button");
      p.textContent = message;
      retry.type = "button";
      retry.textContent = "重试预览";
      retry.addEventListener("click", start, { once: true });
      host.replaceChildren(p, retry);
    };
    const deadline = (ms, message) => {
      win.clearTimeout(timer);
      timer = win.setTimeout(() => fail(message), ms);
    };
    const listener = async (e) => {
      if (
        disposed ||
        e.source !== iframe.contentWindow ||
        e.data?.token !== token
      )
        return;
      if (sent && panel && e.data.kind === 'office-preview-position') { panel.position?.(e.data); return; }
      if (sent && panel && e.data.kind === 'office-panel-state') { panel.state(e.data); return; }
      if (sent && panel && e.data.kind === 'office-panel-metadata') { panel.metadata(e.data); return; }
      if (e.data.kind === "office-complete" && sent) {
        win.clearTimeout(timer);
        note.remove();
        return;
      }
      if(e.data.kind==='office-selection'&&sent&&snapshot&&['attach','edit'].includes(e.data.action)&&JSON.stringify(e.data.request||{}).length<=20000){
        host.dispatchEvent(new win.CustomEvent('office-selection',{bubbles:true,detail:{action:e.data.action,input:{documentId:host.dataset.documentId,revision:snapshot.revision,sha256:snapshot.sha256,request:e.data.request}}}));return;
      }
      if (e.data.kind !== "office-ready" || sent) return;
      sent = true;
      note.textContent = host.dataset.engine === "libreoffice" && !engineReady() ? "Office 引擎启动中…" : "正在生成预览…";
      deadline(host.dataset.engine==='libreoffice'?OFFICE_PREVIEW_TIMEOUT_MS + 35000:15000, host.dataset.engine==='libreoffice'?'本机转换或分页渲染超时；文件未修改。可重试或导出查看。':'文件预览未在15秒内完成；文件未修改。可重试或导出查看。');
      try {
        snapshot = await invoke("documentPreview", {
          id: host.dataset.documentId,
          revision: Number(host.dataset.revision),
          ...(panel ? {panel: true} : {}),
        });
        if (!disposed && host.isConnected)
          iframe.contentWindow.postMessage(
            { kind: "document", token, ...snapshot, panel: !!panel },
            "*",
          );
      } catch (err) {
        fail("无法读取预览文件：" + err.message);
      }
    };
    deadline(5000, "本机预览组件未能启动，文件尚未开始渲染；请升级后重试。");
    win.addEventListener("message", listener);
    iframe.src =
      (win.location.protocol === "file:"
        ? "willbuddy-preview://local/"+(host.dataset.engine==='libreoffice'?"pdf/":"")+"index.html#"
        : (host.dataset.engine==='libreoffice'?"pdf/":"preview/")+"index.html#") + token;
    host.replaceChildren(note, iframe);
    panel?.connect(data => {
      if (!disposed && sent) iframe.contentWindow.postMessage({kind: 'office-panel-command', token, ...data}, '*');
    });
    stop = () => {
      disposed = true;
      finish();
      iframe.remove();
      note.remove();
    };
  }
  start();
  return () => stop();
}

const outlinePreference = 'quank.filePreview.outlineOpen';
const officeFormats = new Set(['docx', 'xlsx', 'pptx']);

export function filePreviewPanel(document, {action, icon, native, inTab}) {
  const {id, name, format, revision} = document;
  const fileName = escape(name + '.' + format);
  const pdfFrame = (native && officeFormats.has(format)) || format === 'pdf';
  const html = format === 'html' ? extractHtml(document.text) : null;
  const preview = pdfFrame || officeFormats.has(format)
    ? `<div class="file-preview-host office-host" data-document-id="${escape(id)}" data-revision="${revision}" data-engine="${pdfFrame ? 'libreoffice' : 'offline'}"></div>`
    : html !== null ? `<div class="file-preview-host office-host html-host" data-html-source="${escape(html)}"></div>`
    : `<article class="file-preview-text" aria-label="文件正文">${format === 'html' ? '<pre>' + escape(document.text) + '</pre>' : rich(document.text || '')}</article>`;
  const controls = (label, command, glyph) => `<button type="button" class="file-icon-button" data-preview-command="${command}" title="${label}" aria-label="${label}" disabled>${glyph}</button>`;
  const uiAction = (label, command, glyph) => `<button type="button" class="file-icon-button" data-action="${command}" data-id="${escape(id)}" title="${label}" aria-label="${label}">${glyph}</button>`;
  return `<section class="file-preview-panel" aria-label="文件预览">
    <header class="file-preview-head"><b title="${fileName}">${fileName}</b>
      ${uiAction('在成果中心定位', 'documentLocate', icon('folder') || '⌑')}
      <span class="file-preview-spacer"></span>
      ${native && officeFormats.has(format) ? uiAction('导出 PDF', 'documentExportPdf', icon('fileDown')) : ''}
      <details class="file-menu"><summary title="更多操作" aria-label="更多操作">⋯</summary><div>
        ${action('下载', 'documentExport', id)}
        ${action('版本历史', 'documentHistory', id)}${action('在成果中心查看', 'documentLocate', id)}
      </div></details>
      ${inTab && officeFormats.has(format) ? action('<span aria-hidden="true">✎</span> <span class="file-edit-label">编辑</span><span class="file-sr">在独立窗口编辑</span>', 'documentOfficeWindow', id, 'file-window-edit') : officeFormats.has(format) ? action('<span aria-hidden="true">✎</span> <span class="file-edit-label" aria-hidden="true">编辑</span><span class="file-sr">QuankSight Office 编辑</span>', 'documentEditor', id, 'file-primary') : ''}
    </header>
    ${inTab && officeFormats.has(format) ? `<div class="file-editing-banner" data-office-editing data-id="${escape(id)}" hidden>正在独立窗口中编辑 · <button type="button" data-action="officeWindowFocus" data-id="${escape(id)}">切到窗口</button></div>` : ''}
    <div class="file-preview-toolbar" ${pdfFrame ? '' : 'hidden'}>
      ${['docx', 'pdf'].includes(format) ? `<button type="button" class="file-icon-button file-find-toggle" aria-expanded="false" title="搜索文字" aria-label="搜索文字">${searchIcon}</button><form class="file-find">${searchField('file-preview-search', '搜索文字', '')}</form>` : ''}
      ${controls('上一页', 'previous', '↑')}${controls('下一页', 'next', '↓')}
      ${controls('适合宽度', 'width', '↔')}${controls('适合页面', 'page', '⛶')}
    </div>
    <div class="file-preview-main">
      <button type="button" class="file-outline-handle" data-outline aria-expanded="false" hidden>大纲</button>
      <aside class="file-outline" aria-label="大纲" data-format="${escape(format)}" hidden></aside>
${preview}
    </div>
    <footer class="file-preview-status" ${pdfFrame ? '' : 'hidden'}>
      <button type="button" data-outline aria-expanded="false" title="大纲" hidden>☷</button>
      <span data-preview-pages hidden></span><span class="file-preview-count" ${format === 'docx' ? 'data-word-count' : ''} data-preview-count hidden></span>
      <span class="file-preview-spacer"></span>
      ${controls('适合页面', 'page', '⛶')}${controls('缩小', 'out', '−')}
      <output data-preview-zoom hidden></output>${controls('放大', 'in', '＋')}
    </footer>
  </section>`;
}

export function previewStatus({current, pages, zoom, format, sheet, sheets}) {
  let count = '';
  if (format === 'xlsx') {
    if (Number.isInteger(sheet) && sheet > 0 && sheet <= sheets) count = `工作表 ${sheet} / ${sheets}`;
  } else if (Number.isInteger(pages) && current > 0 && current <= pages) {
    const unit = format === 'pptx' ? '张' : '页';
    count = `第 ${current} ${unit} / 共 ${pages} ${unit}`;
  }
  return {
    pages: count,
    zoom: Number.isFinite(zoom) && zoom >= 50 && zoom <= 200 ? `${zoom}%` : '',
  };
}

export function mountFilePreviewPanel(panel, invoke, engineReady, position = () => {}) {
  const host = panel.querySelector('.file-preview-host');
  if (!host) return () => {};
  if (host.classList.contains('html-host')) return mountHtmlPreview(host);
  if (host.dataset.engine !== 'libreoffice') return mountOfficePreview(host, invoke, engineReady);
  const outline = panel.querySelector('.file-outline');
  const toggles = [...panel.querySelectorAll('[data-outline]')];
  const controls = [...panel.querySelectorAll('[data-preview-command]')];
  let send = () => {};
  panel.addEventListener('office-locate', event => {
    const target = event.detail || {};
    if (typeof target.text === 'string' || Number.isInteger(target.page)) send({command:'jump', page:target.page, text:target.text});
  });
  let activeOutline = -1;
  let outlineOpen = false;
  const doc = panel.ownerDocument;
  try { outlineOpen = doc.defaultView.localStorage.getItem(outlinePreference) === 'true'; } catch {}
  const updateOutline = () => {
    for (const [index, entry] of Array.from(outline.children).entries()) {
      if (index === activeOutline) entry.setAttribute('aria-current', 'location');
      else entry.removeAttribute('aria-current');
    }
  };
  const setText = (selector, text) => {
    const el = panel.querySelector(selector);
    el.textContent = text;
    el.hidden = !text;
  };
  const setOutline = open => {
    outline.hidden = !open;
    for (const button of toggles) button.setAttribute('aria-expanded', String(open));
  };
  for (const button of toggles) button.addEventListener('click', () => {
    outlineOpen = outline.hidden;
    setOutline(outlineOpen);
    try { doc.defaultView.localStorage.setItem(outlinePreference, String(outlineOpen)); } catch {}
  });
  for (const button of controls) button.addEventListener('click', () => send({command: button.dataset.previewCommand}));
  const form = panel.querySelector('.file-find');
  if (form) {
    const input = form.querySelector('input');
    const toggle = panel.querySelector('.file-find-toggle');
    const expand = open => {
      toggle.setAttribute('aria-expanded', String(open));
      (open ? input : toggle).focus();
    };
    input.maxLength = 160;
    toggle.addEventListener('click', () => expand(toggle.getAttribute('aria-expanded') !== 'true'));
    form.addEventListener('submit', event => {
      event.preventDefault();
      send({command: 'find', text: input.value});
    });
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') expand(false);
    });
  }
  return mountOfficePreview(host, invoke, engineReady, {
    connect(post) { send = post; },
    position,
    state(state) {
      const status = previewStatus({...state, format: outline.dataset.format});
      if (activeOutline !== state.activeOutline) {
        activeOutline = state.activeOutline;
        updateOutline();
      }
      setText('[data-preview-pages]', status.pages);
      setText('[data-preview-zoom]', status.zoom);
      for (const button of controls) {
        const command = button.dataset.previewCommand;
        button.disabled = !Number.isInteger(state.pages) || (command === 'previous' && state.current === 1)
          || (command === 'next' && state.current === state.pages)
          || (command === 'in' && state.zoom === 200) || (command === 'out' && state.zoom === 50);
      }
    },
    metadata({count, entries}) {
      setText('[data-preview-count]', typeof count === 'string' ? count : '');
      if (!Array.isArray(entries)) return;
      outline.replaceChildren(...entries.slice(0, 100).map(entry => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'file-outline-entry';
        button.style.setProperty('--outline-level', String(Math.max(1, Math.min(9, Number(entry.level) || 1)) - 1));
        if (/^data:image\/png;base64,[\w+/=]+$/.test(entry.image || '')) {
          const image = doc.createElement('img');
          image.src = entry.image;
          image.alt = '';
          button.append(image);
        }
        button.append(String(entry.title).slice(0, 300));
        button.disabled = !Number.isInteger(entry.page);
        button.addEventListener('click', () => send({command: 'jump', page: entry.page, text: entry.text}));
        return button;
      }));
      updateOutline();
      for (const button of toggles) button.hidden = !entries.length;
      setOutline(outlineOpen && entries.length > 0);
    },
  });
}
