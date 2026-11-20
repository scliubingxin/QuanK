// [lane:pages] Containers fall back to temporary elements when the shell lane's DOM is not present yet.
export function ensureContainer(id, {parent = 'main', before = null, tag = 'div'} = {}) {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement(tag); el.id = id; el.className = 'wb-temp-container';
  const host = document.querySelector(parent) || document.body, ref = before ? document.querySelector(before) : null;
  ref && ref.parentNode === host ? host.insertBefore(el, ref) : host.append(el);
  return el;
}
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}
export function loadStyles(href = 'pages.css') {
  if (document.querySelector('link[data-wb-pages]')) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; link.dataset.wbPages = '1'; document.head.append(link);
}
