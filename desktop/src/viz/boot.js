/* [ux8] Loaded before ECharts: report any script error to the host so it can fall back instead of waiting. */
(() => {
  const token = location.hash.slice(1);
  let sent = false;
  const report = message => { if (sent || parent === window) return; sent = true; try { parent.postMessage({kind: 'viz-error', token, message: String(message || '组件脚本出错').slice(0, 200)}, '*'); } catch {} };
  addEventListener('error', e => report(e.message || (e.target && e.target.src ? '无法加载 ' + e.target.src.split('/').pop() : '')), true);
  addEventListener('unhandledrejection', e => report(e.reason && e.reason.message));
})();
