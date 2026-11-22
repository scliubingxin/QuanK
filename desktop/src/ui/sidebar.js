// [ux4] Sidebar navigation: a few top-level entries plus grouped entries with a hover / focus flyout (like WorkBuddy),
// replacing the long flat list and the 「更多工具」 drawer. Every page keeps a real data-page button in the DOM.
export const NAV_LAYOUT = [
  {id: 'home', icon: 'chat', title: '工作台'},
  {id: 'feed', icon: 'activity', title: '动态', badge: true},
  {id: 'tasks', icon: 'clock', title: '自动化'},
  {group: 'library', icon: 'folder', title: '资料库', items: [
    ['research', 'file', '投研资料', '按股票整理的研报、公告、笔记、日报复盘与训练数据'], // [v0.53]
    ['library', 'file', '成果中心', '对话产出的文档与成果'],
    ['files', 'folder', '本地文件', '授权给 QuanK 的文件夹'],
    ['studio', 'grid', '创作', '仪表盘、信息图、小应用']]},
  {group: 'capabilities', icon: 'agent', title: '智能体·连接·工具', items: [
    ['agents', 'agent', '智能体', '自定义角色、知识、技能与 MCP'],
    ['connectors', 'link', '连接', '邮件、日历、订阅与办公平台'],
    ['tools', 'shield', '浏览器与权限', '浏览器、命令行与「总是允许」规则'],
    ['security', 'shield', '安全与合规', '加密、应用锁、外发记录、操作审计与合规审阅']]},
  {group: 'context', icon: 'search', title: '智能记忆', items: [
    ['graph', 'link', '知识图谱', '人、公司、项目和它们的关系'],
    ['context', 'spark', '记忆库', '偏好、关注方向与工作背景']]},
];
export const navPages = () => NAV_LAYOUT.flatMap(n => n.items ? n.items.map(i => i[0]) : [n.id]);
export const groupOf = page => NAV_LAYOUT.find(n => n.items?.some(i => i[0] === page)) || null;

export function sidebarNav({page, icon, unread = 0}) {
  const html = NAV_LAYOUT.map(n => {
    if (!n.items) return `<button class="${page === n.id || (n.id === 'home' && (page === 'quant' || page === 'market')) ? 'active' : ''}" data-page="${n.id}">${icon(n.icon)}<span>${n.title}</span>${n.badge && unread ? `<small class="nav-badge" aria-label="未读动态">${unread}</small>` : ''}</button>`;
    const current = n.items.find(i => i[0] === page), active = !!current;
    const items = n.items.map(([id, ic, title, desc]) => `<button class="nav-flyout-item ${page === id ? 'active' : ''}" data-page="${id}" role="menuitem">${icon(ic)}<span><b>${title}</b><small>${desc}</small></span></button>`).join('');
    return `<div class="nav-group ${active ? 'active' : ''}" data-group="${n.group}"><button class="nav-group-head ${active ? 'active' : ''}" data-page="${current ? current[0] : n.items[0][0]}" aria-haspopup="menu">${icon(n.icon)}<span>${n.title}</span>${active ? `<small class="nav-sub">${current[2]}</small>` : ''}<i class="nav-caret" aria-hidden="true">›</i></button><div class="nav-flyout" role="menu" aria-label="${n.title}">${items}</div></div>`;
  }).join('');
  return `<nav class="nav">${html}</nav>`;
}
