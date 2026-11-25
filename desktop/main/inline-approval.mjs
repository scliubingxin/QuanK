import { randomUUID } from 'node:crypto';

const highRisk = /合并|放弃|删除|移出|移除|下单|委托|撤销|清空|退出|发送|document_delete/;

export function approvalRisk(action) {
  return highRisk.test(action);
}

export function createApprovalNotifications({ isFocused, send, open }) {
  const sent = new Set();
  return request => {
    if (sent.has(request.requestId)) return;
    sent.add(request.requestId);
    if (isFocused()) return;
    send(request, () => open(request.requestId));
  };
}

export function createInlineApprovals({ changed = () => {}, created = () => {}, timeoutMs = 60000 } = {}) {
  const entries = new Map();
  function finish(id, decision) {
    const entry = entries.get(id);
    if (!entry?.complete || !entry.card.choices.includes(decision)) return false;
    entry.complete(decision);
    return true;
  }
  function request(action, summary, signal, options = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const { agent = 'QuankSight', chatId, codingTaskId, source, network, taskLabel, choices, promptChoices } = options;
    const risk = options.highRisk || approvalRisk(action);
    const requestId = randomUUID();
    const card = { requestId, action: action.replace(/[？?]$/, ''), summary,
      agent, chatId, codingTaskId, source, network, highRisk: risk, taskLabel, promptChoices,
      time: Date.now(), choices: risk ? ['deny', 'allow'] : choices || ['deny', 'allow', ...(taskLabel ? ['always'] : [])] };
    return new Promise((resolve, reject) => {
      const settle = (decision, error) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        entries.set(requestId, { card: { ...card, decision, finishedAt: Date.now() } });
        const completed = [...entries].filter(([, entry]) => !entry.complete);
        for (const [id] of completed.slice(0, Math.max(0, completed.length - 100))) entries.delete(id);
        changed();
        if (error) reject(error);
        else resolve(decision);
      };
      const abort = () => settle('cancelled', signal.reason);
      const timer = setTimeout(() => settle('cancelled', new DOMException('操作确认超时，已取消', 'TimeoutError')), timeoutMs);
      timer.unref?.();
      signal?.addEventListener('abort', abort, { once: true });
      entries.set(requestId, { card, complete: settle });
      created(card);
      changed();
    });
  }
  return { request, finish, list: () => [...entries.values()].map(entry => entry.card),
    cancelAll: () => { for (const { complete } of entries.values()) complete?.('cancelled', new DOMException('操作确认已取消', 'AbortError')); } };
}
