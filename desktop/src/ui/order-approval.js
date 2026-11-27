// [v1.0.4] Order confirmations used to be handed to the conversation-only card list, so from
// 自动化 › 半自动委托 the card was never drawn and the buttons looked dead. The card is now mounted
// under its own order row.
const rowFor = (root, orderId) => {
  for (const row of root.querySelectorAll('.td-row[data-order]')) {
    if (row.dataset.order === String(orderId)) return row;
  }
  return null;
};

/** Insert one card under each order row it belongs to. Returns the request ids that are on screen. */
export function mountOrderApprovals(root, cards, render) {
  const mounted = [];
  if (!root) return mounted;
  for (const card of cards || []) {
    if (!card?.orderId) continue;
    const existing = root.querySelector('[data-approval-id="' + String(card.requestId).replace(/"/g, '') + '"]');
    if (existing) { mounted.push(card.requestId); continue; }
    const row = rowFor(root, card.orderId);
    if (!row) continue;
    const holder = document.createElement('li');
    holder.className = 'td-approval-row';
    holder.innerHTML = render(card);
    row.after(holder);
    mounted.push(card.requestId);
  }
  return mounted;
}

/** Bring an already-mounted card into view instead of silently ignoring a second click. */
export function revealOrderApproval(root, requestId) {
  const card = root?.querySelector('[data-approval-id="' + String(requestId).replace(/"/g, '') + '"]');
  if (!card) return false;
  card.scrollIntoView?.({ block: 'center' });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1200);
  return true;
}
