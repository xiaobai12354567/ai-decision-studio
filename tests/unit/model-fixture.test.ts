import test from "node:test";
import assert from "node:assert/strict";
import { createModelFixtureServer } from "../fixtures/model-server.mjs";

const input = {
  conditions: [{ id: "condition-1" }],
  selectedPathId: "path-1",
  parentScenarioId: "scenario-1",
  paths: [
    {
      id: "path-1",
      title: "需要重新核实的路径",
      freshness: "stale",
      scenarios: [{ id: "scenario-1", freshness: "stale" }],
    },
    {
      id: "path-2",
      title: "无需更新的路径",
      freshness: "fresh",
      scenarios: [{ id: "scenario-2", freshness: "fresh" }],
    },
  ],
};

async function withFixture(run: (base: string) => Promise<void>) {
  const server = createModelFixtureServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function complete(base: string, task?: string, system = "任务文案已经全部改写。") {
  return fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(task === undefined ? {} : { "X-AI-Task": task }),
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
}

async function output(response: Response) {
  assert.equal(response.status, 200);
  const body = await response.json();
  return JSON.parse(body.choices[0].message.content);
}

test("model fixture routes all tasks independently of prompt wording or input shape", async () => {
  await withFixture(async (base) => {
    for (const system of ["任务文案已经全部改写。", "仅更新输入中；总结用户已表达；生成2到3条。"]) {
      const clarify = await output(await complete(base, "clarify", system));
      assert.deepEqual(Object.keys(clarify).sort(), ["conditions", "questions", "title"]);

      const paths = await output(await complete(base, "paths", system));
      assert.equal(paths.paths.length, 2);
      assert.deepEqual(paths.paths[0].conditionIds, ["condition-1"]);
      assert.equal(paths.paths[0].id, undefined);

      const scenarios = await output(await complete(base, "scenarios", system));
      assert.equal(scenarios.scenarios.length, 2);

      const branch = await output(await complete(base, "branch", system));
      assert.deepEqual(Object.keys(branch), ["scenario"]);
      assert.ok(branch.scenario.event);

      const refresh = await output(await complete(base, "refresh", system));
      assert.deepEqual(
        refresh.paths.map((item: { id: string }) => item.id),
        ["path-1"],
      );
      assert.deepEqual(
        refresh.scenarios.map((item: { id: string }) => item.id),
        ["scenario-1"],
      );

      const summary = await output(await complete(base, "summary", system));
      assert.equal(summary.inclinationPathId, null);
      assert.equal(summary.actions.length, 2);
    }
  });
});

test("model fixture rejects missing or unknown task metadata instead of guessing", async () => {
  await withFixture(async (base) => {
    for (const task of [undefined, "unknown-task"]) {
      const response = await complete(base, task, "生成2到3条");
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.type, "invalid_request_error");
    }
    assert.equal((await (await fetch(`${base}/stats`)).json()).calls, 0);
  });
});

test("model fixture preserves one-shot failure and invalid-output controls", async () => {
  await withFixture(async (base) => {
    const control = (value: object) =>
      fetch(`${base}/control`, { method: "POST", body: JSON.stringify(value) });
    const failControl = await control({ fail: true });
    await failControl.text();
    const failed = await complete(base, "clarify");
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).error.message, "test failure");
    await output(await complete(base, "clarify"));

    const invalidControl = await control({ delay: 1, invalid: true });
    await invalidControl.text();
    const invalid = await output(await complete(base, "paths"));
    assert.deepEqual(invalid.paths[0].conditionIds, ["foreign-condition"]);
    const valid = await output(await complete(base, "paths"));
    assert.deepEqual(valid.paths[0].conditionIds, ["condition-1"]);
    assert.equal((await (await fetch(`${base}/stats`)).json()).calls, 4);
  });
});
