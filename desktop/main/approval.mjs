/** Serialized native confirmations with active/queued cancellation and bounded lifetime. */
export function createApprover({
  dialog,
  getWindow,
  focus,
  timeoutMs = 60000,
}) {
  let queue = Promise.resolve(),
    generation = new AbortController(),
    nativePending = false;
  function approve(title, detail, signal, { browserScope, documentReadScope, ruleScope } = {}) {
    const epoch = generation.signal;
    const result = queue
      .catch(() => {})
      .then(async () => {
        const local = new AbortController();
        const combined = AbortSignal.any([
          epoch,
          local.signal,
          ...(signal ? [signal] : []),
        ]);
        combined.throwIfAborted();
        if (nativePending)
          throw Error("上一个系统确认框尚未关闭，请按 Esc 取消后重试");
        focus();
        const parent = getWindow();
        // Parentless macOS message boxes are synchronous and cannot honor AbortSignal.
        if (!parent || parent.isDestroyed?.())
          throw Error("工作台窗口不可用，未打开确认框");
        if (browserScope && browserScope.origin.length > 200)
          throw Error("网站地址过长，无法安全确认");
        const displayDetail =
          detail +
          (browserScope
            ? `\n\n选「本任务本站点允许」：这次任务里再访问 ${browserScope.origin} 不再询问；其他网站或新任务会重新确认。`
            : documentReadScope ? '\n\n选「本任务允许此文档」：这次任务里再读取这份文档的当前版本不再询问。' : "");
        if (
          displayDetail.length > 1000 ||
          displayDetail.split("\n").length > 20
        )
          throw Error("确认信息过长，已阻止操作。请缩短参数或拆分修改批次");
        // [p2-m2] offer "always allow" only when the note still fits the dialog limits
        const ruleNote = ruleScope?.label ? `\n\n「总是允许」会保存规则：${String(ruleScope.label).slice(0, 200)}。30 天内不再询问，定时任务也可自动执行；可在「浏览器与 CLI」页撤销。` : "";
        const offerRule = !!ruleNote && (displayDetail + ruleNote).length <= 1000 && (displayDetail + ruleNote).split("\n").length <= 20;
        const shownDetail = offerRule ? displayDetail + ruleNote : displayDetail;
        const timer = setTimeout(
          () =>
            local.abort(
              new DOMException("操作确认超时，已取消", "TimeoutError"),
            ),
          timeoutMs,
        );
        let abort;
        try {
          const cancelled = new Promise((_, reject) => {
            abort = () => reject(combined.reason);
            combined.addEventListener("abort", abort, { once: true });
          });
          nativePending = true;
          const native = Promise.resolve()
            .then(() => {
              combined.throwIfAborted();
              return dialog.showMessageBox(parent, {
                type: "question",
                title: "QuanK · 操作确认",
                message: title,
                detail: shownDetail,
                buttons: [...(browserScope
                  ? ["取消", "允许这一次", "本任务本站点允许"]
                  : documentReadScope ? ["取消", "允许这一次", "本任务允许此文档"]
                  : ["取消", "允许这一次"]), ...(offerRule ? ["总是允许"] : [])],
                defaultId: 0,
                cancelId: 0,
                noLink: true,
                textWidth: 500,
                signal: combined,
              });
            })
            .finally(() => {
              nativePending = false;
            });
          const reply = await Promise.race([native, cancelled]);
          combined.throwIfAborted();
          if (offerRule && reply.response === (browserScope || documentReadScope ? 3 : 2))
            return { allowed: true, alwaysAllow: true };
          if (browserScope && reply.response === 2)
            return { allowed: true, browserTask: true };
          if (documentReadScope && reply.response === 2)
            return { allowed: true, documentTask: true };
          return reply.response === 1;
        } finally {
          clearTimeout(timer);
          combined.removeEventListener("abort", abort);
        }
      });
    queue = result;
    return result;
  }
  approve.cancelAll = () => {
    generation.abort();
    generation = new AbortController();
  };
  return approve;
}
