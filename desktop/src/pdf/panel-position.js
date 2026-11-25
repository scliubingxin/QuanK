(() => {
  const token = location.hash.slice(1);
  let frame;
  function publish() {
    frame = undefined;
    if (!document.body.classList.contains('panel')) return;
    const sheets = [...document.querySelectorAll('.pdf-sheet')];
    if (!sheets.length) return;
    const part = sheets.findIndex(sheet => sheet.getBoundingClientRect().bottom > 0);
    const bounds = sheets[Math.max(0, part)].getBoundingClientRect();
    parent.postMessage({kind:'office-preview-position', token, part:Math.max(0,part),
      width:bounds.width, top:document.scrollingElement.scrollTop, left:document.scrollingElement.scrollLeft,
      within:Math.max(0,-bounds.top), pages:sheets.length}, '*');
  }
  function schedule() { if (frame === undefined) frame = requestAnimationFrame(publish); }
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', schedule);
  new MutationObserver(schedule).observe(document.getElementById('content'), {subtree:true, childList:true});
})();
