import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";

// Explicit opt-in: one real request using synthetic data, never existing user records.
if (process.env.RUN_LIVE_AI_CHECK !== "1") {
  console.log(
    "Skipped. Set RUN_LIVE_AI_CHECK=1 to send one synthetic case to the configured model service.",
  );
  process.exit(0);
}
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
let cookie;
try {
  const created = await fetch(`${base}/api/decisions`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      description:
        "测试案例：我正在考虑是否去另一座城市工作。目前工作稳定但成长有限。我还没有拿到外地工作机会，预算和家庭安排尚未确定，希望先找到可以验证的下一步。",
    }),
  });
  assert.equal(created.status, 201, "Synthetic draft creation failed");
  cookie = created.headers.get("set-cookie").split(";")[0];
  const { data: decision } = await created.json();
  const response = await fetch(`${base}/api/decisions/${decision.id}/clarify`, {
    method: "POST",
    headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: decision.revision }),
    signal: AbortSignal.timeout(100000),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, payload.error || "Real model request failed");
  assert.ok(payload.data.conditions.length <= 10);
  assert.ok(payload.data.questions.length <= 3);
  assert.equal(
    new Set(payload.data.conditions.map((condition) => condition.kind)).size,
    payload.data.conditions.length,
    "Condition kinds must be unique",
  );
  const budget =
    payload.data.conditions.find((condition) => condition.kind === "budget")?.value || "";
  assert.ok(!/\d/.test(budget), "The synthetic user did not supply a numeric budget");
  assert.ok(!/\d+\s*%/.test(JSON.stringify(payload.data)), "Do not invent success probabilities");
  console.log(
    "PASS: configured model returned a validated overview and bounded questions for a synthetic case.",
  );
  if (process.env.RUN_LIVE_WORKFLOW_CHECK === "1") {
    let current = decision;
    async function mutate(suffix, method, value) {
      const response = await fetch(`${base}/api/decisions/${current.id}${suffix}`, {
        method,
        headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, expectedRevision: current.revision }),
        signal: AbortSignal.timeout(100000),
      });
      const result = await response.json();
      assert.equal(response.status, 200, result.error || `Failed ${suffix}`);
      current = result.data;
    }
    await mutate("/overview", "PUT", {
      title: "合成案例：城市与职业探索",
      confirm: true,
      conditions: [
        { kind: "goal", label: "目标", value: "寻找成长机会，但暂不离职" },
        { kind: "budget", label: "过渡预算", value: "具体预算尚未确定，需要先核实" },
        { kind: "family", label: "家庭安排", value: "迁移前需要与家人讨论" },
      ],
    });
    await mutate("/generations", "POST", { kind: "paths", requestKey: crypto.randomUUID() });
    assert.ok(current.paths.length >= 2 && current.paths.length <= 3);
    assert.equal(new Set(current.paths.map((p) => p.title)).size, current.paths.length);
    const pathId = current.paths[0].id;
    await mutate("/generations", "POST", {
      kind: "scenarios",
      scopeId: pathId,
      requestKey: crypto.randomUUID(),
    });
    const scenarios = current.paths.find((p) => p.id === pathId).scenarios;
    assert.ok(scenarios.length > 0 && scenarios.length <= 3);
    assert.ok(
      scenarios.every(
        (s) => s.timeframe && s.event && Array.isArray(s.assumptions) && Array.isArray(s.basis),
      ),
    );
    await mutate("/generations", "POST", { kind: "summary", requestKey: crypto.randomUUID() });
    assert.ok(current.summary.actions.length >= 1 && current.summary.actions.length <= 3);
    assert.equal(
      current.summary.inclinationPathId,
      null,
      "Viewing a path does not imply a preference",
    );
    assert.ok(current.summary.actions.every((a) => a.task && a.verification && a.decisionHelp));
    console.log(
      "PASS: real model paths, bounded scenarios with assumptions/basis, and actionable summary with no forced preference.",
    );
  }
} finally {
  if (cookie) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query('DELETE FROM "VisitorSession" WHERE "tokenHash" = $1', [
        createHash("sha256")
          .update(cookie.slice(cookie.indexOf("=") + 1))
          .digest("hex"),
      ]);
    } finally {
      await client.end();
    }
    console.log("Synthetic test session removed.");
  }
}
