import {presetCatalog, plazaIcon, iconColor, iconText} from './preset-catalog.js'; // [ux10]
export {iconColor, iconText};
import { escape } from "./markdown.js";
export { mcpForm, bindMcpForm, mcpPayload } from "./mcp-form.js"; // [mcp2]
export function capabilityTabs(tab) {
  return `<div class="capability-tabs" role="tablist">${[
    ["agents", "智能体"],
    ["skills", "Skills 技能库"],
    ["mcp", "MCP 连接器"],
  ]
    .map(
      ([id, name]) =>
        `<button role="tab" aria-selected="${id === tab}" class="${id === tab ? "active" : ""}" data-action="capabilityTab" data-id="${id}">${name}</button>`,
    )
    .join("")}</div>`;
}
export function registryChoices(kind, state, a = {}) {
  const skill = kind === "skills",
    items = skill ? state.skillPackages || [] : state.mcpConnections || [],
    ids = skill ? a.skillIds || [] : a.mcpIds || [],
    field = skill ? "skillId" : "mcpId";
  return (
    items
      .map(
        (row) =>
          `<label class="capability-choice"><input type="checkbox" name="${field}" value="${escape(row.id)}" ${ids.includes(row.id) ? "checked" : ""} ${!row.enabled && !ids.includes(row.id) ? "disabled" : ""}><span><strong>${escape(row.name)}</strong><small>${escape(skill ? row.description : row.url)}</small><small>${row.enabled ? "已启用" : "已停用"}${skill ? " · " + row.files.length + " 个文件" : ""}</small></span></label>`,
      )
      .join("") ||
    `<p>暂无${skill ? "已上传技能" : "MCP连接"}，可以在这里添加，也可从独立管理页维护。</p>`
  );
}
export function skillsPage(state) { // [ux10] plaza layout: my skills above the catalogue, same card style
  const mine = (state.skillPackages || []).map((s) => `<div class="card plaza-card mine-card" data-preset-searchable="${escape([s.name, s.description].join(' ').toLowerCase())}" data-preset-mine>
<div class="pc-head">${plazaIcon(s.name)}<div class="pc-title"><h3>${escape(s.name)}</h3><small>${s.preset ? '预置技能' : '你上传的技能'} · ${s.files.length} 个文件 · ${Math.max(1, Math.round(s.bytes / 1024))} KB</small></div><span class="pc-state${s.enabled ? ' on' : ''}">${s.enabled ? "已启用" : "已停用"}</span></div>
<p class="pc-desc">${escape(s.description)}</p>
<div class="pc-actions"><button class="secondary" data-action="inspectSkill" data-id="${escape(s.id)}">查看内容</button><button class="secondary" data-action="toggleSkill" data-id="${escape(s.id)}">${s.enabled ? "停用" : "启用"}</button><button class="link-danger" data-action="removeSkill" data-id="${escape(s.id)}">删除</button></div></div>`).join("");
  const section = `<div class="plaza-section-head"><h2>我的 Skill</h2><small>${mine ? '在构建智能体时按需绑定。ZIP 输入 32MiB／展开 16MiB／单资源 4MiB；资源保存在本机。' : '还没有技能。上传 SKILL.md 或 ZIP，或从下方预置技能里添加。'}</small></div>${mine ? `<div class="plaza-grid">${mine}</div>` : ''}`;
  const catalog = presetCatalog("skills", state, {mine: section});
  return catalog || `<section class="plaza">${section}<button class="primary" data-action="uploadSkill">上传 Skill</button></section>`;
}
export function mcpPage(state, busy = new Set()) { // [ux10]
  const mine = (state.mcpConnections || []).map((c) => {
    const tested = c.lastTest?.status === "succeeded";
    const status = busy.has(c.id) ? "正在测试" : tested ? "上次发现 " + c.lastTest.tools.length + " 项工具" : c.lastTest ? "上次测试未通过" : "尚未测试";
    return `<div class="card plaza-card mine-card" data-preset-searchable="${escape([c.name, c.description, c.url].join(' ').toLowerCase())}" data-preset-mine>
<div class="pc-head">${plazaIcon(c.name)}<div class="pc-title"><h3>${escape(c.name)}</h3><small class="connection-url">${escape(c.transport === "stdio" ? [c.command, ...(c.args || [])].join(" ") : c.url)}</small></div><span class="pc-state${c.enabled ? ' on' : ''}">${c.enabled ? "已启用" : "已停用"}</span></div>
<div class="pc-tags"><span class="pc-tag t-blue">${c.transport === "stdio" ? "本机程序" + ((c.envNames || []).length ? " · " + c.envNames.length + " 个环境变量" : "") : c.auth === "oauth" ? "浏览器登录 · " + (c.signedIn ? "已登录" : "未登录") : c.auth === "bearer" ? "Bearer · " + (c.hasToken ? "凭据已配置" : "缺少凭据") : "无认证"}</span><span class="pc-tag${tested ? ' t-green' : c.lastTest ? ' t-red' : ''}">${status}</span></div>
<p class="pc-desc">${escape(c.description || "自定义MCP服务")}</p>
<div class="pc-actions"><button class="secondary" data-action="editMcp" data-id="${escape(c.id)}">配置</button>${c.auth === "oauth" ? `<button class="${c.signedIn ? "secondary" : "primary"}" data-action="mcpSignIn" data-id="${escape(c.id)}">${c.signedIn ? "重新登录" : "登录"}</button>${c.signedIn ? `<button class="secondary" data-action="mcpSignOut" data-id="${escape(c.id)}">退出登录</button>` : ""}` : ""}<button class="secondary" data-action="testMcp" data-id="${escape(c.id)}" ${busy.has(c.id) || !c.enabled ? "disabled" : ""}>测试连接</button>${busy.has(c.id) ? `<button class="secondary" data-action="cancelMcpTest" data-id="${escape(c.id)}">取消测试</button>` : ""}<button class="link-danger" data-action="removeMcp" data-id="${escape(c.id)}">删除</button></div>
${tested ? `<details class="pc-more"><summary>上次发现的工具（非实时在线状态）</summary>${c.lastTest.tools.map((t) => `<p><strong>${escape(t.name)}</strong><small>${escape(t.description)}</small></p>`).join("")}</details>` : ""}</div>`;
  }).join("");
  const section = `<div class="plaza-section-head"><h2>我的连接</h2><small>${mine ? '连接测试只发现真实工具，业务调用仍逐次审批。' : '还没有连接器。添加服务后，可先测试再绑定智能体。'}</small></div>${mine ? `<div class="plaza-grid">${mine}</div>` : ''}`;
  const catalog = presetCatalog("mcp", state, {mine: section});
  return catalog || `<section class="plaza">${section}<button class="primary" data-action="newMcp">添加 MCP 连接</button></section>`;
}

/** The token field is always blank. Existing secrets are never returned to HTML. */
export function mcpAuthFields(c = {}, prefix = "") {
  return `<label>认证方式<select name="${prefix}auth"><option value="none" ${c.auth !== "bearer" ? "selected" : ""}>无认证</option><option value="bearer" ${c.auth === "bearer" ? "selected" : ""}>Bearer Token</option></select></label><label>Bearer Token<input name="${prefix}token" type="password" data-mcp-secret autocomplete="off" spellcheck="false" maxlength="4096" placeholder="${c.hasToken ? "已保存；留空保留同一地址的令牌" : "选择Bearer后填写，8–4096字符"}"></label><small>${c.hasToken ? "此连接已配置凭据。" : "此连接尚未配置凭据。"}令牌仅通过系统安全存储加密保存；不支持时拒绝保存。更换地址需重新填写；选择无认证并保存将清除令牌。保存不联网。</small>`;
}
