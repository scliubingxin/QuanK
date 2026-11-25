import { escape } from "./markdown.js";
import { docIcon } from "./avatars.js"; // [F1d]
const excerpt=d=>d.text.replace(/^\[(?:word|xl|ppt)\/[^\]]+\]\s*$/gm,'').replace(/\s+/g,' ').trim().slice(0,120);
export function documentLibrary({ state, action, date, filter }) {
  // [ux8] compact cards: type icon, name, meta, two-line excerpt; preview + edit up front, the rest as quiet links
  const b = (label, act, id, cls = 'secondary', aria = '') => `<button type="button" class="${cls}" data-action="${act}" data-id="${escape(id)}"${aria ? ` aria-label="${aria}" title="${aria}"` : ''}>${label}</button>`;
  const size = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : (n || 0) + ' B';
  const office = d => state.officeNative && ["docx", "xlsx", "pptx"].includes(d.format);
  const card = d => {
    const edit = office(d) ? b("编辑", "documentEditor", d.id, "primary", "QuankSight Office 编辑") : d.format === "pdf" ? "" : d.hasRichSource ? b("Word 画布", "documentCanvas", d.id, "primary")
      : !state.officeNative && d.format === "docx" ? b("Word 分段编辑", "documentWordEditor", d.id, "primary") : b("编辑内容", "documentEditor", d.id, "primary");
    const more = [d.format === "xlsx" ? b("生成仪表盘", "dashboardFromDocument", d.id, "") : "", ["md", "html"].includes(d.format) ? b("转换为 Word", "documentConvert", d.id, "") : "",
      office(d) && !state.officeWorkspace ? b("收回编辑结果", "officeCollect", d.id, "") : "", b("AI 修改", "documentContinue", d.id, ""), !d.hasRichSource && d.format !== "pdf" ? b("精确修改", "documentEdit", d.id, "") : "",
      office(d) ? b("导出 PDF", "documentExportPdf", d.id, "") : "", b("导出文件", "documentExport", d.id, ""), d.history.length ? b("历史版本", "documentHistory", d.id, "") : "",
      b("删除文档", "documentDelete", d.id, "danger-text")].join("");
    return `<article class="lib-card" data-document="${escape(d.id)}"><div class="lib-top">${docIcon(d.format, "lib-icon " + String(d.format || "").replace(/\W/g, ""))}<div class="lib-title"><h3 title="${escape(d.name)}">${escape(d.name)}</h3><small>v${d.revision} · ${date(d.time)} · ${size(d.size)}${d.history.length ? ` · ${d.history.length} 个前版` : ""}</small></div></div>
<p class="lib-excerpt">${escape(excerpt(d)) || "（空文档）"}</p><div class="lib-main">${b("预览", "documentView", d.id)}${edit}</div><div class="lib-more">${more}</div></article>`;
  };
  const docs = (state.documents || []).filter(d => !filter || filter.ids.includes(d.id));
  return `<section aria-label="可编辑文档"><div class="lib-head"><h2>文档</h2><small>${docs.length} 份${filter ? " · " + escape(filter.label) : ""}</small><div class="lib-tools">${filter ? action("清除筛选", "libraryClearFilter") : ""}${action("写 Word 文档", "documentCanvas", "", "primary")}${action("新建文档", "documentNew")}${action("导入文档", "documentImport")}</div></div>${docs.length ? `<div class="lib-grid">${docs.map(card).join("")}</div>` : '<p class="empty-note">还没有文档。在对话里说「写一份……」或导入已有文件。</p>'}</section>`;
}
export const documentExamples = {
  docx: JSON.stringify(
    {
      title: "项目方案",
      blocks: [
        { type: "heading", text: "目标" },
        { type: "paragraph", text: "请描述目标和执行步骤。" },
        {
          type: "table",
          rows: [
            ["阶段", "负责人"],
            ["启动", "待定"],
          ],
        },
      ],
    },
    null,
    2,
  ),
  xlsx: JSON.stringify(
    {
      sheets: [
        {
          name: "计划",
          rows: [
            ["任务", "预算", "完成"],
            ["调研", 1000, false],
            ["开发", 2000, false],
            ["合计", {formula:"SUM(B2:B3)"}, null],
          ],
        },
      ],
    },
    null,
    2,
  ),
  pptx: JSON.stringify(
    {
      slides: [
        {
          title: "项目方案",
          bullets: ["业务目标", "执行计划", "验收标准"],
          notes: "演讲备注",
        },
      ],
    },
    null,
    2,
  ),
  md: "# 项目方案\n\n## 目标\n\n请描述目标。",
  html: '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>项目方案</title></head><body><h1>项目方案</h1><p>请描述目标。</p></body></html>',
};

export function messageDocuments(state,chat,message) {
  const refs=[...(chat?.documentRefs||[]).filter(r=>r.runId===message.runId),
    ...(state.executions||[]).filter(r=>r.chatId===chat?.id&&r.runId===message.runId&&['document_create','document_edit','document_convert','document_write','document_patch'].includes(r.tool)&&r.status==='succeeded'&&r.result?.verified===true).map(r=>r.result.document)];
  return [...new Set(refs.map(r=>r.id))].map(id=>(state.documents||[]).find(d=>d.id===id)).filter(Boolean);
}
export function documentSize(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB'
    : bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes || 0) + ' B';
}

export function documentCards(documents, action, native = false, workspace = false, chatId = '') {
  if (!documents.length) return '';
  const cards = documents.map(d => {
    const name = d.name + '.' + d.format;
    const id = escape(d.id);
    const office = ['docx', 'xlsx', 'pptx'].includes(d.format);
    const edit = native && office ? action('QuankSight Office 编辑', 'documentEditor', d.id)
      : d.hasRichSource ? action('Word 画布', 'documentCanvas', d.id)
      : d.format === 'docx' ? action('Word 分段编辑', 'documentWordEditor', d.id)
      : d.format === 'pdf' ? '' : action('编辑内容', 'documentEditor', d.id);
    return `<div class="document-result file-result" data-document="${id}">
      ${docIcon(d.format, 'file-type lib-icon ' + escape(d.format))}
      <div class="file-result-name"><b title="${escape(name)}">${escape(name)}</b><small>${documentSize(d.size)} · v${d.revision}</small></div>
      <details class="file-menu"><summary aria-label="文件操作" title="文件操作">⋯</summary><div>
        ${action('预览', 'documentView', d.id)}${edit}
        ${native && office ? action('导出 PDF', 'documentExportPdf', d.id) : ''}
        ${action('下载', 'documentExport', d.id)}${action('在成果中心查看', 'documentLocate', d.id)}
        ${native && office && !workspace ? action('收回编辑结果', 'officeCollect', d.id) : ''}
      </div></details>
      <button type="button" class="file-icon-button" data-action="documentView" data-id="${id}" aria-label="在右侧打开" title="在右侧打开">↗</button>
      ${action('打开', 'documentView', d.id, 'file-primary')}
    </div>`;
  }).join('');
  return `<section class="document-results" aria-label="已生成的文档">${cards}
    ${documents.length > 1 ? action('查看所有产物（' + documents.length + '）›', 'libraryConversation', chatId, 'file-all') : ''}
  </section>`;
}
