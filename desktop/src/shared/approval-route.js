// [v1.0.4] 「前往授权」 used to fall through to the workbench home for anything without a chat,
// which became a dead end once home stopped drawing cards. One router decides where an approval lives.
const ORDER_ACTIONS = /^(?:下单|模拟下单|撤销委托单|重新填单)/;
const ORDER_EXACT = /^(?:下单|模拟下单|撤销委托单|重新填单)(?:[：:].*)?$/;

export const isOrderApproval = request => !!request
  && (!!request.orderId || ORDER_EXACT.test(String(request.action || '').trim()));

/** Where a 前往授权 click should land: {kind:'order'|'chat'|'coding'|'feed', ...}. Pure. */
export function approvalRoute(request, {chats = [], orders = []} = {}) {
  if (!request) return {kind: 'feed'};
  const action = String(request.action || '').trim();
  const text = action + ' ' + String(request.detail || request.summary || '');
  // An order can be named by orderId, or quoted in the action text ("撤销委托单 od-1").
  const named = request.orderId || (ORDER_ACTIONS.test(action) ? (orders.find(o => text.includes(o.id)) || {}).id : undefined);
  if (named || isOrderApproval(request)) {
    if (named && orders.some(o => o.id === named)) return {kind: 'order', orderId: named, requestId: request.requestId};
    return {kind: 'feed', requestId: request.requestId}; // the order is gone (expired): answer it on the feed
  }
  if (request.codingTaskId) return {kind: 'coding', taskId: request.codingTaskId, requestId: request.requestId};
  if (request.chatId && chats.some(chat => chat.id === request.chatId))
    return {kind: 'chat', chatId: request.chatId, requestId: request.requestId};
  return {kind: 'feed', requestId: request.requestId};
}

/** Requests the bar should still list: an order approval already mounted under its row is dropped. */
export function barRequests(requests, {page, taskTab, orders = []} = {}) {
  const mounted = page === 'tasks' && taskTab === 'trade';
  return (requests || []).filter(request => !(mounted && isOrderApproval(request)
    && (!request.orderId || orders.some(o => o.id === request.orderId))));
}

/** The request a bar click should open: the first pending one, and 「查看全部」 when there are more. */
export function barTargets(pending) {
  const list = Array.isArray(pending) ? pending : [];
  return {first: list[0]?.requestId, all: list.length > 1};
}

/** Order cards to mount under their rows: local cards with an orderId, plus stored pending approvals that
 *  route to an order still on the list. Decided stored approvals and duplicates of local cards are skipped. */
export function orderApprovalCards({local = [], requests = [], orders = []} = {}) {
  const mine = (local || []).filter(card => card && card.orderId);
  const seen = new Set(mine.map(card => card.requestId));
  const stored = [];
  for (const request of requests || []) {
    if (!request || request.decision || seen.has(request.requestId)) continue;
    const target = approvalRoute(request, {orders});
    if (target.kind === 'order') { stored.push({...request, orderId: target.orderId}); seen.add(request.requestId); }
  }
  return [...mine, ...stored];
}
