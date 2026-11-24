// Wait for Office's own schedule. Calling office.wait() would start it early.
export function createQuantAutostart({
  enabled, officePhase, defer, run, onError = () => {},
  officeLimit = 20_000, delay = 2_000, poll = 250, retryDelay = 60_000,
  now = Date.now,
}) {
  let timer, deadline, closed = false, attempted = false, running = false;
  const eligible = () => !closed && enabled();
  function schedule(fn, ms) {
    clearTimeout(timer);
    timer = undefined;
    if (!eligible()) return;
    timer = setTimeout(() => { timer = undefined; void fn(); }, ms);
    timer.unref?.();
  }
  async function attempt() {
    if (!eligible() || attempted) return;
    running = true;
    try {
      const wait = await Promise.resolve().then(defer).catch(() => false);
      if (!eligible()) return;
      if (wait) return schedule(attempt, retryDelay);
      attempted = true;
      await run(eligible);
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  }
  function waitForOffice() {
    const phase = officePhase();
    const remaining = deadline - now();
    if (!phase || phase === 'ready' || phase === 'failed' || remaining <= 0) schedule(attempt, delay);
    else schedule(waitForOffice, Math.min(poll, remaining));
  }
  return {
    pending: () => eligible() && (timer !== undefined || running),
    windowReady() {
      if (deadline !== undefined || !eligible()) return;
      deadline = now() + officeLimit;
      waitForOffice();
    },
    close() { closed = true; clearTimeout(timer); },
  };
}
