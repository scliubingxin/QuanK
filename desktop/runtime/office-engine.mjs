export function createOfficeEngine({
  enabled, defer = async () => false, warmPreview, warmEditor, notify = () => {},
  delayMs = 3000, retryDelayMs = 60000,
}) {
  let timer, pending, windowReady = false, closed = false, generation = 0;
  let state = {phase: 'idle', timings: {}};

  function update(patch) {
    state = {...state, ...patch};
    notify();
  }

  function record(stage, timing) {
    console.info('[Office]', stage, timing);
    const timings = {...state.timings, [stage]: timing};
    if (stage === 'font' && !timings.startupFont) timings.startupFont = timing;
    update({timings});
  }

  function start() {
    if (pending) return pending;
    if (closed) return Promise.resolve(false);
    clearTimeout(timer);
    const started = performance.now();
    pending = Promise.resolve().then(async () => {
      update({phase: 'starting', reason: null});
      try {
        for (const [stage, warm] of [['preview', warmPreview], ['editor', warmEditor]]) {
          if (closed) return false;
          const t = performance.now();
          const result = await warm();
          if (result === false) throw Error(stage === 'preview' ? '预览进程未能启动' : '编辑进程未能启动');
          if (result !== null) record(stage, {ms: Math.round(performance.now() - t)});
        }
        if (closed) return false;
        record('ready', {ms: Math.round(performance.now() - started)});
        update({phase: 'ready'});
        return true;
      } catch (error) {
        if (!closed) {
          const reason = String(error.message || error).slice(0, 300);
          console.warn('[Office] 启动失败', reason);
          update({phase: 'failed', reason});
        }
        return false;
      }
    }).finally(() => { pending = null; });
    return pending;
  }

  function schedule(delay = delayMs) {
    clearTimeout(timer);
    const ticket = ++generation;
    if (!windowReady || closed || !enabled() || state.phase !== 'idle') return;
    timer = setTimeout(async () => {
      const wait = await Promise.resolve().then(defer).catch(() => false);
      if (ticket !== generation || closed || !enabled() || pending || state.phase !== 'idle') return;
      if (wait) schedule(retryDelayMs);
      else void start();
    }, delay);
    timer.unref?.();
  }

  return {
    record,
    state: () => state,
    windowReady() { windowReady = true; schedule(); },
    settingsChanged: () => schedule(),
    async wait() {
      const run = pending || (state.phase === 'idle' && windowReady && enabled() ? start() : null);
      if (run) await run;
      if (state.phase === 'failed') throw Error('Office 引擎启动失败：' + state.reason);
    },
    retry: start,
    close() { closed = true; clearTimeout(timer); },
  };
}
