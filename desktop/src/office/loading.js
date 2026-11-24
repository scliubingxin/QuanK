const retry = document.querySelector('button');
if (location.hash === '#error') {
  document.querySelector('.spin').hidden = true;
  document.querySelector('b').textContent = '未能载入 Office 文档';
  document.querySelector('small').textContent = 'Office 内核载入超时或遇到错误。';
  retry.hidden = false;
  retry.onclick = async () => {
    retry.disabled = true;
    try { await window.willbuddyOffice.retryLoad(); }
    catch (error) { document.querySelector('small').textContent = error.message; }
    finally { retry.disabled = false; }
  };
}
