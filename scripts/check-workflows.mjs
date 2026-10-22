import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

// Only run against the separately configured fixture server, never the user's live model service.
if (process.env.TEST_FIXTURE_AI !== "1")
  throw new Error(
    "Set TEST_FIXTURE_AI=1 and run a separate app server using the test model fixture.",
  );
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
assert.notEqual(base, "http://127.0.0.1:3000", "Use a separate test service");
let cookie, record;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
async function call(path, method = "GET", body, expected = 200, own = true) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(own && cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${payload.error || "unexpected status"}`,
  );
  return { response, data: payload.data };
}
const root = () => `/api/decisions/${record.id}`;
async function mutate(suffix, method, body = {}) {
  const result = await call(root() + suffix, method, {
    ...body,
    expectedRevision: record.revision,
  });
  record = result.data;
  return record;
}
async function generate(kind, extra = {}) {
  return mutate("/generations", "POST", { kind, requestKey: randomUUID(), ...extra });
}
const control = (value) =>
  fetch("http://127.0.0.1:4010/control", { method: "POST", body: JSON.stringify(value) });
try {
  const created = await call(
    "/api/decisions",
    "POST",
    { description: "测试案例：是否去另一座城市工作，预算八万元，希望先取得机会再决定。" },
    201,
  );
  cookie = created.response.headers.get("set-cookie").split(";")[0];
  record = created.data;
  assert.equal(record.sessionId, undefined, "Private owner IDs must not be returned");
  await mutate("/overview", "PUT", {
    title: "集成测试决策",
    confirm: true,
    conditions: [
      { kind: "budget", label: "积蓄", value: "八万元" },
      { kind: "family", label: "家庭安排", value: "每月回家" },
    ],
  });
  const key = randomUUID(),
    revision = record.revision;
  await mutate("/generations", "POST", { kind: "paths", requestKey: key });
  const replay = await call(root() + "/generations", "POST", {
    kind: "paths",
    requestKey: key,
    expectedRevision: revision,
  });
  assert.equal(replay.data.revision, record.revision, "Replay cannot apply output twice");
  await call(
    root() + "/generations",
    "POST",
    { kind: "paths", requestKey: key, expectedRevision: record.revision },
    409,
  );
  assert.equal(record.paths.length, 2);
  const pathId = record.paths[0].id;
  await generate("scenarios", { scopeId: pathId });
  let parent = record.paths[0].scenarios[0];
  await mutate(`/scenarios/${parent.id}/feedback`, "POST", {
    kind: "correction",
    text: "我需要定期回家，这个假设要调整",
  });
  const feedbackId = record.paths[0].scenarios[0].feedback[0].id;
  assert.equal(
    record.paths[0].scenarios[0].freshness,
    "stale",
    "An assumption correction requires the scenario to be checked again",
  );
  await generate("refresh");
  await generate("branch", {
    scopeId: parent.id,
    question: "如果机会暂时没有出现，接下来怎么办？",
  });
  let child = record.paths[0].scenarios.find((s) => s.parentId === parent.id);
  await generate("branch", { scopeId: child.id, question: "如果再尝试一次仍没有结果怎么办？" });
  const deep = record.paths[0].scenarios.find((s) => s.depth === 2);
  await call(
    root() + "/generations",
    "POST",
    {
      expectedRevision: record.revision,
      requestKey: randomUUID(),
      kind: "branch",
      scopeId: deep.id,
      question: "不允许无限分支",
    },
    400,
  );
  await generate("branch", { scopeId: parent.id, question: "还有哪些可调整的安排？" });
  await generate("branch", { scopeId: parent.id, question: "如何降低试错所需时间？" });
  assert.equal(record.paths[0].scenarios.length, 6);
  await call(
    root() + "/generations",
    "POST",
    {
      expectedRevision: record.revision,
      requestKey: randomUUID(),
      kind: "branch",
      scopeId: parent.id,
      question: "不允许超过情境数量上限",
    },
    400,
  );
  const stableIds = record.conditions.map((c) => c.id).sort();
  await mutate("/overview", "PUT", {
    title: record.title,
    confirm: true,
    conditions: [
      { kind: "budget", label: "积蓄", value: "三万元" },
      { kind: "family", label: "家庭安排", value: "每月回家" },
    ],
  });
  assert.deepEqual(record.conditions.map((c) => c.id).sort(), stableIds);
  assert.ok(record.paths.every((p) => p.freshness === "stale"));
  assert.ok(record.paths[0].scenarios.every((s) => s.freshness === "stale"));
  await generate("refresh");
  assert.ok(record.paths.every((p) => p.freshness === "fresh"));
  assert.ok(record.paths[0].scenarios.every((s) => s.freshness === "fresh"));
  const feedback = record.paths[0].scenarios
    .flatMap((s) => s.feedback)
    .find((f) => f.id === feedbackId);
  assert.ok(feedback.needsReview, "Feedback survives but requires review after refresh");
  await mutate(`/feedback/${feedbackId}`, "PATCH", { needsReview: false });
  await generate("summary");
  assert.equal(record.summary.inclinationPathId, null);
  const action = record.summary.actions[0];
  await mutate(`/actions/${action.id}/select`, "POST");
  await mutate(`/actions/${action.id}/results`, "POST", {
    text: "已完成岗位访谈，确认需要进一步提升技能再申请。",
  });
  assert.equal(record.stage, "revisiting");
  await generate("summary");
  assert.ok(
    record.actionHistory.some((a) => a.id === action.id && a.results.length === 1),
    "Summary regeneration preserves completed results",
  );
  await call(
    root() + `/paths/${pathId}`,
    "PATCH",
    {
      expectedRevision: record.revision,
      title: "外部会话不能修改",
      benefits: [],
      costs: [],
      prerequisites: [],
    },
    401,
    false,
  );
  const oldRevision = record.revision;
  await control({ delay: 1500 });
  const pending = fetch(base + root() + "/generations", {
    method: "POST",
    headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedRevision: oldRevision,
      requestKey: randomUUID(),
      kind: "summary",
    }),
  });
  // Wait until the fixture has received the request; do not rely on app scheduling timing.
  for (let attempt = 0; attempt < 50; attempt++) {
    const runs = (await call(root())).data.generationRuns;
    if (runs.some((run) => run.status === "running")) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await call(
    root() + "/generations",
    "POST",
    { expectedRevision: oldRevision, requestKey: randomUUID(), kind: "summary" },
    409,
  );
  await mutate("/overview", "PUT", {
    title: "生成期间修改标题",
    confirm: true,
    conditions: record.conditions.map(({ kind, label, value }) => ({ kind, label, value })),
  });
  assert.equal((await pending).status, 409, "Old generation cannot overwrite later edits");
  const reloaded = (await call(root())).data;
  assert.equal(reloaded.title, "生成期间修改标题");
  assert.ok(reloaded.generationRuns.some((run) => run.status === "superseded"));
  assert.equal(reloaded.generationRuns[0].inputSnapshot, undefined);
  await control({ fail: true });
  const failedRevision = record.revision;
  await call(
    root() + "/generations",
    "POST",
    { expectedRevision: failedRevision, requestKey: randomUUID(), kind: "summary" },
    502,
  );
  record = (await call(root())).data;
  assert.equal(record.revision, failedRevision, "Failed model calls cannot alter business state");
  await mutate(`/paths/${pathId}`, "DELETE");
  assert.ok(!record.paths.some((p) => p.id === pathId));
  const preserved = await client.query(
    'SELECT count(*)::int AS count FROM "Feedback" WHERE id=$1',
    [feedbackId],
  );
  assert.equal(preserved.rows[0].count, 1, "Soft deletion preserves historical feedback");
  while (record.paths.length < 5)
    await mutate("/paths", "POST", {
      title: `补充路径${record.paths.length}`,
      benefits: [],
      costs: [],
      prerequisites: [],
    });
  await call(
    root() + "/paths",
    "POST",
    {
      expectedRevision: record.revision,
      title: "第六条路径",
      benefits: [],
      costs: [],
      prerequisites: [],
    },
    400,
  );
  const main = record;
  record = (
    await call(
      "/api/decisions",
      "POST",
      { description: "第二份隔离案例：验证模型非法引用不能进入业务数据库。" },
      201,
    )
  ).data;
  await mutate("/overview", "PUT", {
    title: "非法引用测试",
    confirm: true,
    conditions: [{ kind: "goal", label: "目标", value: "验证数据引用" }],
  });
  await control({ invalid: true });
  await call(
    root() + "/generations",
    "POST",
    { expectedRevision: record.revision, requestKey: randomUUID(), kind: "paths" },
    502,
  );
  record = (await call(root())).data;
  assert.equal(record.paths.length, 0, "Invalid references cannot partially create paths");
  assert.equal(record.revision, 1);
  record = main;
  console.log(
    "PASS: paths, finite branches, feedback, condition dependencies, refresh, action revisit, replay, isolation, stale generation, failure rollback and history preservation.",
  );
} finally {
  if (cookie)
    await client.query('DELETE FROM "VisitorSession" WHERE "tokenHash"=$1', [
      createHash("sha256")
        .update(cookie.slice(cookie.indexOf("=") + 1))
        .digest("hex"),
    ]);
  await client.end();
  console.log("Only test-owned session and data cleaned up.");
}
