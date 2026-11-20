// [p2-m2] Smart approvals: persistent "always allow" rules for low-risk, repeatable operations, and an
// unattended mode for scheduled tasks (no dialog: allowed by rule, otherwise recorded as "waiting for you").
// Only three kinds of operation can ever be covered by a rule:
//   browser  – open / read / inspect pages of one exact origin (never click or fill: those can submit forms)
//   cli      – one exact executable with a fixed leading argument list (never shells, interpreters or
//              destructive programs, never project services)
//   document – reading one library document (any revision); edits, writes and deletes always ask
import { uid } from '../core.mjs';

export const RULE_LIMIT = 100, PENDING_LIMIT = 50, DEFAULT_RULE_DAYS = 30;
const BROWSER_TOOLS = ['browser_open', 'browser_read', 'browser_snapshot'];
// Programs that run arbitrary code, change permissions, delete/move data or reach other machines.
const CLI_DENY = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'env', 'xargs', 'exec', 'eval', 'sudo', 'su', 'doas',
  'python', 'python3', 'node', 'deno', 'bun', 'perl', 'ruby', 'php', 'lua', 'osascript', 'open', 'npx', 'npm', 'pnpm', 'yarn', 'pip', 'pip3', 'brew',
  'rm', 'rmdir', 'mv', 'dd', 'shred', 'truncate', 'chmod', 'chown', 'chgrp', 'ln', 'kill', 'killall', 'pkill', 'launchctl', 'shutdown', 'reboot',
  'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'nc', 'ncat', 'telnet', 'ftp', 'mail', 'sendmail', 'diskutil', 'security', 'defaults', 'crontab']);
const ARG_DENY = /^(push|reset|clean|rm|delete|del|remove|uninstall|install|publish|deploy|drop|format|--force|-f|-rf|-fr|--hard|--delete)$/i;
const base = p => String(p || '').split(/[\\/]/).pop().toLowerCase();

/** What an "always allow" rule for this operation would cover, or null when the operation can never be ruled. */
export function ruleCandidate(name, {command, readScope, url, documentToken, projectService, documentName} = {}) {
  if (BROWSER_TOOLS.includes(name)) {
    const raw = name === 'browser_open' ? url : readScope?.url;
    try { const u = new URL(raw); if (!['https:', 'http:'].includes(u.protocol)) return null; return {kind: 'browser', origin: u.origin, label: '网站 ' + u.origin}; } catch { return null; }
  }
  if (name === 'cli_execute' && command && !projectService) {
    const exe = base(command.requestedExecutable || command.executable);
    if (!exe || CLI_DENY.has(exe) || command.args.some(a => ARG_DENY.test(a))) return null;
    const prefix = command.args.slice(0, 2).filter(a => !a.startsWith('-') || a.length <= 3).slice(0, 2);
    return {kind: 'cli', executable: command.executable, argsPrefix: prefix, cwd: command.cwd, label: '命令 ' + [exe, ...prefix].join(' ') + '（工作目录 ' + command.cwd + '）'};
  }
  if (name === 'document_read' && documentToken?.readScope?.id) return {kind: 'document', documentId: documentToken.readScope.id, label: '读取文档 ' + String(documentName || documentToken.readScope.id).slice(0, 120)};
  return null;
}

// [p2-m6] Agent-side operations (Skill scripts, MCP, local vector search) are identified by an exact key.
const clip = (s, n = 120) => String(s || '').slice(0, n);
/** Connecting to an MCP server only reads its tool catalog. */
export const mcpConnectScope = server => server?.url && !String(server.url).startsWith('stdio:') ? { // [mcp2] starting a local program always asks
  kind: 'mcp', key: 'connect ' + server.url, label: '连接 MCP ' + clip(server.name, 40) + '（' + clip(server.url) + '）'} : null;
/** Only tools the server itself declares read-only (annotations.readOnlyHint) can be ruled; everything else always asks. */
export const mcpToolScope = target => target?.readOnly === true && target.server?.url ? {kind: 'mcp', key: 'tool ' + target.server.url + ' ' + target.name, label: '只读 MCP 工具 ' + clip(target.name, 60) + '（' + clip(target.server.url) + '）'} : null;
/** A Skill script rule is bound to the exact package hash: any update to the package asks again. */
export const skillRunScope = (pkg, file) => pkg?.sha256 && file ? {kind: 'skill', key: 'run ' + pkg.sha256 + ' ' + file, label: 'Skill「' + clip(pkg.name, 40) + '」的脚本 ' + clip(file, 80) + '（仅当前版本）'} : null;
export const skillImportScope = pkg => pkg?.sha256 ? {kind: 'skill', key: 'import ' + pkg.sha256, label: '回收 Skill「' + clip(pkg.name, 40) + '」的成果副本（仅当前版本）'} : null;
export const vectorScope = model => model ? {kind: 'vector', key: 'vector ' + model, label: '本机向量检索（模型 ' + clip(model, 60) + '）'} : null;

function matches(rule, candidate, command) {
  if (!candidate || rule.kind !== candidate.kind) return false;
  if (rule.key || candidate.key) return !!rule.key && rule.key === candidate.key;
  if (rule.kind === 'browser') return rule.origin === candidate.origin;
  if (rule.kind === 'document') return rule.documentId === candidate.documentId;
  if (rule.kind === 'cli') return rule.executable === command.executable && rule.cwd === command.cwd && rule.argsPrefix.every((a, i) => command.args[i] === a);
  return false;
}

export function createApprovalRules({store, now = Date.now, notify = () => {}}) {
  const data = () => { store.data.approvalRules ??= []; store.data.pendingApprovals ??= []; return store.data; };
  const unattended = new Map(); // chatId -> taskId
  const live = () => data().approvalRules.filter(r => !r.expires || r.expires > now());
  const api = {
    unattended: {set: (chatId, taskId) => unattended.set(chatId, taskId), clear: chatId => unattended.delete(chatId), has: chatId => !!chatId && unattended.has(chatId), task: chatId => unattended.get(chatId)},
    /** A rule that covers this operation (and its scope), or null. Counts the use. */
    match(candidate, command, {chatId} = {}) {
      if (!candidate) return null;
      const taskId = unattended.get(chatId);
      const rule = live().find(r => matches(r, candidate, command) && (!r.taskId || r.taskId === taskId));
      if (rule) { rule.uses = (rule.uses || 0) + 1; rule.lastUsed = now(); }
      return rule || null;
    },
    add(candidate, {taskId, days = DEFAULT_RULE_DAYS, source = 'dialog'} = {}) {
      if (!candidate) throw new Error('该操作不能设为总是允许');
      const d = data();
      d.approvalRules = d.approvalRules.filter(r => !r.expires || r.expires > now());
      const same = d.approvalRules.find(r => r.kind === candidate.kind && r.label === candidate.label && (r.taskId || '') === (taskId || ''));
      const expires = days > 0 ? now() + days * 86400e3 : null;
      if (same) { same.expires = expires; return same; }
      if (d.approvalRules.length >= RULE_LIMIT) throw new Error(`最多保存 ${RULE_LIMIT} 条规则，请先删除不用的`);
      const {kind, origin, executable, argsPrefix, cwd, documentId, label, key} = candidate;
      const rule = {id: uid(), kind, label, created: now(), expires, uses: 0, source, ...(taskId ? {taskId} : {}),
        ...(key ? {key} : kind === 'browser' ? {origin} : kind === 'cli' ? {executable, argsPrefix: [...argsPrefix], cwd} : {documentId})};
      d.approvalRules.unshift(rule);
      return rule;
    },
    /** Unattended run hit an operation that needs a person: remember it for the user, never block the run. */
    defer({chatId, tool, title, detail, candidate}) {
      const d = data();
      const item = {id: uid(), time: now(), chatId, taskId: unattended.get(chatId), tool, title, detail: String(detail || '').slice(0, 600), ...(candidate ? {candidate} : {})};
      d.pendingApprovals = [item, ...d.pendingApprovals].slice(0, PENDING_LIMIT);
      notify();
      return item;
    },
    /**
     * [p2-m6] Wrap the native approver for agent-side confirmations of one conversation: a matching rule
     * allows without a dialog; an unattended (scheduled) run never opens a dialog and records the item for
     * the user instead; otherwise the dialog offers "always allow" when the operation has a rule scope.
     * Always resolves to true / false, or throws for a deferred unattended operation.
     */
    gate(approve, {chatId} = {}) {
      const gated = async (title, detail, signal, opts = {}) => {
        const scope = opts?.ruleScope || null;
        if (api.match(scope, null, {chatId})) { await store.save(); return true; }
        if (unattended.has(chatId)) {
          api.defer({chatId, tool: scope?.kind || 'agent', title, detail, candidate: scope || undefined});
          const e = new Error('定时任务无人值守：该操作需要用户确认，已记入「待你确认」，本次没有执行'); e.code = 'UNATTENDED_DEFERRED'; throw e;
        }
        const r = await approve(title, detail, signal, scope ? {ruleScope: scope} : undefined);
        if (r === true) return true;
        if (scope && r?.allowed === true && r.alwaysAllow === true) { api.add(scope, {source: 'dialog'}); await store.save(); notify(); return true; }
        return false;
      };
      gated.gated = true;
      return gated;
    },
    /** IPC handler: remove / clear / allowPending / dismissPending. */
    async handle(p) {
      const d = data();
      if (p?.action === 'remove') d.approvalRules = d.approvalRules.filter(r => r.id !== p.id);
      else if (p?.action === 'clear') d.approvalRules = [];
      else if (p?.action === 'allowPending') {
        const item = d.pendingApprovals.find(x => x.id === p.id);
        if (!item) throw new Error('待确认项不存在');
        if (!item.candidate) throw new Error('该操作每次都需要你确认，不能设为总是允许');
        api.add(item.candidate, {taskId: p.onlyTask && item.taskId ? item.taskId : undefined, source: 'pending'});
        d.pendingApprovals = d.pendingApprovals.filter(x => x.id !== p.id);
      }
      else if (p?.action === 'dismissPending') d.pendingApprovals = p.id ? d.pendingApprovals.filter(x => x.id !== p.id) : [];
      else throw new Error('未知操作');
      await store.save(); notify();
      return d;
    },
  };
  return api;
}
