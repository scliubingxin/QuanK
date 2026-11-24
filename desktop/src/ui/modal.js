import { escape } from './markdown.js';

export function modalLayout(title, body, submit, icon) {
  return `<form class="modal-layout" method="dialog" novalidate><header><h2>${escape(title)}</h2><button type="button" data-modal-close class="icon-button" value="cancel" aria-label="关闭">${icon('close')}</button></header><div class="modal-body">${body}<p id="modal-error" role="alert" hidden></p></div><footer><button type="button" data-modal-close value="cancel" class="secondary">关闭</button>${submit ? `<button type="button" id="modalSubmit" class="primary">${submit}</button>` : ''}</footer></form>`;
}
