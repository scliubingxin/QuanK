import { test } from "node:test";
import assert from "node:assert/strict";
import { createInlineApprovals } from "../main/inline-approval.mjs";
import { createApprover } from "../main/approval.mjs";
import { ToolRuntime } from "../runtime/tools.mjs";
import { createBrowserPermissions } from "../runtime/browser-permissions.mjs";
test("emergency cancellation settles every pending card and permits new requests", async () => {
  const approvals = createInlineApprovals();
  const approve = createApprover({ approvals });
  const first = approve("first", "detail");
  const second = approve("second", "detail");
  const ids = approvals.list().map(card => card.requestId);
  approve.cancelAll();
  await Promise.all([assert.rejects(first, { name: "AbortError" }), assert.rejects(second, { name: "AbortError" })]);
  for (const id of ids) assert.equal(approvals.finish(id, "allow"), false);
  const next = approve("next", "detail");
  assert.equal(approvals.finish(approvals.list().at(-1).requestId, "allow"), true);
  assert.equal(await next, true);
});

test("browser task consent keeps its exact origin", async () => {
  const approvals = createInlineApprovals();
  const approve = createApprover({ approvals });
  const response = approve("browser", "", undefined, { browserScope: { origin: "https://example.com", runId: "r" } });
  const [card] = approvals.list();
  assert.deepEqual(card.choices, ["deny", "allow", "always"]);
  assert.match(card.taskLabel, /https:\/\/example.com/);
  approvals.finish(card.requestId, "always");
  assert.deepEqual(await response, { allowed: true, browserTask: true });
});
test("browser grant exact origin/run, known cross-origin target, revoke and completion boundaries", () => {
  const p = createBrowserPermissions(),
    scope = p.scope(
      "browser_open",
      { url: "https://example.com/a" },
      { runId: "r" },
    );
  p.allow(scope);
  assert.equal(
    p.has(
      p.scope("browser_open", { url: "https://example.com/b" }, { runId: "r" }),
    ),
    true,
  );
  for (const [url, runId] of [
    ["http://example.com", "r"],
    ["https://example.com:8443", "r"],
    ["https://other.example", "r"],
    ["https://example.com", "another"],
  ])
    assert.equal(p.has(p.scope("browser_open", { url }, { runId })), false);
  assert.equal(
    p.scope(
      "browser_click",
      {},
      {
        runId: "r",
        prepared: {
          url: "https://example.com",
          target: { href: "https://elsewhere.example" },
        },
      },
    ),
    null,
  );
  p.release("r");
  assert.equal(p.has(scope), false);
  p.allow(scope);
  p.revoke();
  assert.throws(() => p.check(scope), /撤销/);
  assert.throws(() => p.allow(scope), /撤销/);
  assert.equal(p.scope("cli_execute", {}, { runId: "r" }), null);
});
test("runtime reuses browser consent only in same run/site; CLI remains individual approval", async () => {
  const store = {
    data: { settings: {}, executions: [], documents: [], folders: [] },
    save: async () => {},
    log: () => {},
  };
  let approvals = 0;
  const browser = {
    list: () => [{ id: "w", url: "https://example.com/path" }],
    open: async () => ({ status: "opened" }),
    read: async () => ({ status: "read", text: "actual fixture" }),
    snapshot: async () => ({ status: "inspected" }),
  };
  const runtime = new ToolRuntime({
    store,
    browser,
    approve: async (_t, _d, _s, context) => {
      approvals++;
      return context?.browserScope
        ? { allowed: true, browserTask: true }
        : false;
    },
  });
  await runtime.execute(
    "browser_open",
    { url: "https://example.com" },
    undefined,
    { runId: "r" },
  );
  await runtime.execute("browser_read", { id: "w" }, undefined, { runId: "r" });
  await runtime.execute("browser_snapshot", { id: "w" }, undefined, {
    runId: "r",
  });
  assert.equal(approvals, 1);
  assert.equal(store.data.executions[0].authorization, "browser_task_origin");
  await runtime.execute("browser_read", { id: "w" }, undefined, {
    runId: "another",
  });
  assert.equal(approvals, 2);
  runtime.browserPermissions.revoke();
  await runtime.execute("browser_read", { id: "w" }, undefined, { runId: "r" });
  assert.equal(approvals, 3);
});
test("revocation during persistence blocks an automatically authorized browser action", async () => {
  const store = {
    data: { executions: [], folders: [] },
    save: async () => {},
    log: () => {},
  };
  let reads = 0;
  const runtime = new ToolRuntime({
    store,
    browser: {
      list: () => [{ id: "w", url: "https://example.com" }],
      read: async () => {
        reads++;
        return { status: "read" };
      },
    },
    approve: async () => ({ allowed: true, browserTask: true }),
  });
  await runtime.execute("browser_read", { id: "w" }, undefined, { runId: "r" });
  let saves = 0;
  store.save = async () => {
    if (++saves === 2) runtime.browserPermissions.revoke();
  };
  const result = await runtime.execute("browser_read", { id: "w" }, undefined, {
    runId: "r",
  });
  assert.equal(result.status, "failed");
  assert.equal(reads, 1);
});
test("oversized approval never creates a card; Word approval uses a summary", async () => {
  const approvals = createInlineApprovals();
  const approve = createApprover({ approvals });
  await assert.rejects(approve("CLI", "x".repeat(1001)), /过长/);
  await assert.rejects(approve("CLI", "x\n".repeat(21)), /过长/);
  assert.equal(approvals.list().length, 0);
  const store = {
    data: { documents: [], executions: [], folders: [] },
    save: async () => {},
    log: () => {},
  };
  let actualDetail;
  const runtime = new ToolRuntime({
    store,
    approve: async (title, detail) => {
      actualDetail = detail;
      return true;
    },
  });
  const result = await runtime.execute("document_create", {
    name: "长报告",
    format: "docx",
    content: JSON.stringify({
      title: "分析报告",
      blocks: [{ type: "paragraph", text: "这是报告正文。".repeat(1000) }],
    }),
  });
  assert.equal(result.status, "succeeded");
  assert.ok(actualDetail.length < 700);
  assert.ok(!actualDetail.includes('"blocks"'));
  assert.match(actualDetail, /摘要/);
});
test('navigation during body read cannot return another origin under old consent',async()=>{const {BrowserService}=await import('../runtime/browser.mjs');const b=new BrowserService({});let url='https://example.com';b.windows.set('w',{isDestroyed:()=>false,getTitle:()=>'',webContents:{getURL:()=>url,executeJavaScript:async()=>{url='https://elsewhere.example';return 'must not leak';}}});await assert.rejects(b.read('w'),/导航/);});
