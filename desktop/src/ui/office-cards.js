import {escape} from './markdown.js';
import {approvalCard} from './approval-card.js';

const clock = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const localTime = time => clock.format(new Date(time));
const asOf = data => data.sourceAsOf ? (data.sourceAsOf.length === 10 ? data.sourceAsOf : localTime(data.sourceAsOf)) + (data.sourceTiming === 'close' ? '（收盘）' : '') : '来源未提供时间';

function tableMarkup({cells, note, truncated}) {
  return `<table aria-label="表格修改预览" style="border-collapse:collapse;width:100%;font-size:12px"><tbody>
    ${cells.map(row => `<tr>${row.map(cell => `<td style="border:1px solid var(--line,#dce2ed);padding:4px 8px;${cell.changed ? 'background:#e1edff;color:#163869;' : ''}">
      ${cell.changed && cell.oldValue ? `<del>${escape(cell.oldValue)}</del> ` : ''}${escape(cell.newValue || (cell.changed ? '清空' : ''))}</td>`).join('')}</tr>`).join('')}
    </tbody></table>${note ? `<div>${escape(note)}</div>` : ''}${truncated ? '<small>仅显示前 6 行、4 列</small>' : ''}`;
}

export function officeApprovalCard(request, action, details = request.officePreview) {
  if (request.decision || !details) return approvalCard(request, action);
  const markup = approvalCard(request, (label, name, id, variant) => {
    if (name === 'approvalExpand') return '';
    if (name === 'approvalDecision') variant = id.endsWith(':allow') ? 'primary' : 'secondary';
    return action(label, name, id, variant);
  });
  const content = `<div style="margin:9px 0 4px">
    <div style="font-weight:600">${escape(details.heading)}</div>
    ${details.reason ? `<div style="margin:4px 0">${escape(details.reason)}</div>` : ''}
    <details style="margin-top:6px" open><summary>修改预览</summary>
      ${details.items.map(item => `<div style="margin:8px 0">
        <div style="font-weight:600;margin-bottom:3px"><span aria-hidden="true" style="display:inline-block;width:24px;color:#2f62f5">${escape(item.icon)}</span>${escape(item.title)}</div>
        ${item.table ? tableMarkup(item.table) : item.textDiff ? `<div style="margin-left:24px"><del>${escape(item.textDiff.before)}</del> <mark style="background:#e1edff;color:#163869">${escape(item.textDiff.after)}</mark></div>` : item.detail ? `<div style="margin-left:24px">${escape(item.detail)}</div>` : ''}
      </div>`).join('')}
    </details></div>`;
  const plain = `<pre class="inline-approval-summary">${escape(request.summary || '')}</pre>`;
  return markup.replace(plain, () => content);
}

function quantDateLine(data) {
  const fetched = localTime(data.fetchedAt);
  const sourceDate = asOf(data).slice(0, 10);
  const readTime = fetched.startsWith(sourceDate ?? 'never') ? fetched.slice(11) : fetched;
  return `${data.sourceAsOf ? '数据截至 ' + asOf(data) : '来源未提供数据时间'}· 读取于 ${readTime}`;
}

export function officeResultCard(result, action, {now = Date.now()} = {}) {
  const active = now < result.expiresAt;
  const days = Math.ceil((result.expiresAt - now) / 86400000);
  return `<section class="inline-approval-card" data-office-change="${escape(result.undoToken)}">
    <header><h3>${escape(result.title)}</h3></header>
    <details style="margin:7px 0" open><summary>修改清单</summary>
      <ul style="margin:5px 0;padding-left:22px">${result.items.map((item, index) => `<li style="margin:4px 0">
        ${action(escape(item.title), 'officeLocate', result.undoToken + ':' + index, 'secondary')}</li>`).join('')}</ul></details>
    ${result.quantData ? `<div style="margin:8px 0">${escape(quantDateLine(result.quantData))}</div>` : ''}
    <div class="inline-approval-actions">
      ${action('预览定位', 'officeLocate', result.undoToken + (result.items.length ? ':0' : ''), 'primary')}
      ${action('编辑', 'officeEditWindow', result.undoToken + (result.items.length ? ':0' : ''), 'secondary')}
      ${action(active ? '撤回本次修改' : '打开版本历史', 'officeRollback', result.undoToken, 'secondary')}
      <span style="color:var(--muted);font-size:12px">${active ? `${days} 天内可撤回` : '可恢复修改前的版本'}</span>
    </div>
  </section>`;
}
