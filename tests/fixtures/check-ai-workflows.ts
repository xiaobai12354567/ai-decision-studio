import assert from "node:assert/strict";
import { createModelFixtureServer } from "./model-server.mjs";
import { generateDecisionObject } from "../../src/server/ai/provider";
import { decisionPrompts } from "../../src/server/ai/prompts";
import * as schemas from "../../src/server/ai/schemas";
import * as workflows from "../../src/server/ai/workflows";
import type { Snapshot } from "../../src/server/repositories/snapshot";

// Only the fields used by the AI context mapper are needed; no database is loaded.
const decision = {
  title: "城市与职业选择",
  description: "希望寻找成长机会，但需要先确认预算和家庭安排。",
  conditions: [
    { id: "budget-1", kind: "budget", label: "过渡预算", value: "三万元", confirmed: true },
  ],
  paths: [
    {
      id: "path-1",
      title: "先核实新机会",
      benefits: ["减少信息不确定性"],
      costs: ["需要投入时间"],
      prerequisites: ["确认实际岗位"],
      freshness: "stale",
      scenarios: [
        {
          id: "scenario-1",
          parentId: null,
          timeframe: "三个月后",
          event: "核实过渡安排",
          changes: [],
          difficulties: [],
          assumptions: ["岗位信息尚待确认"],
          basis: ["已确认的过渡预算"],
          freshness: "stale",
          feedback: [],
        },
      ],
    },
  ],
  summary: null,
  actions: [],
} as unknown as Snapshot;

async function main() {
  const requests: {
    task: string | string[] | undefined;
    version: string | string[] | undefined;
  }[] = [];
  const server = createModelFixtureServer();
  server.on("request", (request) => {
    if (request.url?.endsWith("/chat/completions"))
      requests.push({
        task: request.headers["x-ai-task"],
        version: request.headers["x-ai-prompt-version"],
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  process.env.DEEPSEEK_API_KEY = "workflow-unit-fixture-only";
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.DEEPSEEK_MODEL = "fixture";

  try {
    const cases = [
      [
        "clarify",
        () => workflows.clarify(decision.description, decision.conditions),
        schemas.aiOverviewSchema,
      ],
      ["paths", () => workflows.generatePaths(decision), schemas.pathsOutput],
      ["scenarios", () => workflows.generateScenarios(decision, "path-1"), schemas.scenariosOutput],
      [
        "branch",
        () => workflows.generateBranch(decision, "scenario-1", "如果预算不够怎么办？"),
        schemas.branchOutput,
      ],
      ["refresh", () => workflows.refresh(decision), schemas.refreshOutput],
      ["summary", () => workflows.generateSummary(decision), schemas.summaryOutput],
    ] as const;

    for (const [kind, generate, schema] of cases) {
      assert.equal(schema.safeParse(await generate()).success, true, kind);
      assert.deepEqual(requests.at(-1), { task: kind, version: decisionPrompts[kind].version });
    }
    assert.equal(requests.length, cases.length);

    const rewritten = {
      ...decisionPrompts.paths,
      version: "paths-reworded-test",
      system: "请返回路径 JSON。无关短语：总结用户已表达；仅更新输入中。",
    };
    const output = await generateDecisionObject(
      schemas.pathsOutput,
      rewritten,
      workflows.context(decision),
    );
    assert.equal(output.paths.length, 2);
    assert.deepEqual(requests.at(-1), { task: "paths", version: rewritten.version });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
