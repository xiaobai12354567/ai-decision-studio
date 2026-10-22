import { createServer } from "node:http";

// Test-only model endpoint. The application never switches to this fixture automatically.
let next = { delay: 0, fail: false, invalid: false };
let calls = 0;
const path = (title, ids) => ({
  title,
  benefits: ["保留探索空间"],
  costs: ["需要投入验证时间"],
  prerequisites: ["先确认实际机会与预算"],
  conditionIds: ids,
});
const scenario = (ids) => ({
  timeframe: "三个月后",
  event: "开始检验这条路径的现实可行性",
  changes: ["获得更多岗位信息"],
  difficulties: ["可能需要调整安排"],
  assumptions: ["尚未确认的岗位机会需要验证"],
  basis: ["依据用户提供的约束与目标"],
  conditionIds: ids,
});
const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    if (request.url === "/control") {
      next = { delay: 0, fail: false, invalid: false, ...body };
      response.end("ok");
      return;
    }
    if (request.url === "/stats") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ calls }));
      return;
    }
    if (!request.url.endsWith("/chat/completions")) {
      response.writeHead(404).end();
      return;
    }
    calls++;
    const mode = next;
    next = { delay: 0, fail: false, invalid: false };
    if (mode.delay) await new Promise((resolve) => setTimeout(resolve, mode.delay));
    if (mode.fail) {
      response
        .writeHead(503, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: { message: "test failure", type: "server_error" } }));
      return;
    }
    const system = body.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const prompt = JSON.parse(body.messages.filter((m) => m.role === "user").at(-1).content);
    const ids = prompt.conditions?.map((c) => c.id).filter(Boolean) || [];
    let output;
    if (system.includes("仅更新输入中")) {
      output = {
        paths: prompt.paths
          .filter((p) => p.freshness === "stale")
          .map((p) => ({ ...path(p.title, ids), id: p.id, reason: "预算变化后调整过渡安排。" })),
        scenarios: prompt.paths
          .flatMap((p) => p.scenarios)
          .filter((s) => s.freshness === "stale")
          .map((s) => ({ ...scenario(ids), id: s.id, reason: "使用最新预算重新检查假设。" })),
      };
    } else if (system.includes("总结用户已表达")) {
      output = {
        inclinationPathId: null,
        reason: "信息仍不足以做最终决定，先验证具体机会。",
        valuedBenefits: ["保留选择空间"],
        unacceptableCosts: ["超出已确认预算"],
        unknowns: ["实际岗位机会尚未确认"],
        actions: [
          {
            task: "访谈一位目标岗位从业者",
            verification: "了解岗位日常和招聘要求",
            decisionHelp: "判断是否值得进一步申请",
          },
          {
            task: "核对过渡期生活预算",
            verification: "确认实际支出",
            decisionHelp: "判断过渡安排是否可承受",
          },
        ],
      };
    } else if (prompt.parentScenarioId) output = { scenario: scenario(ids) };
    else if (prompt.selectedPathId)
      output = {
        scenarios: [
          scenario(ids),
          { ...scenario(ids), timeframe: "六个月后", event: "复核新机会是否符合生活安排" },
        ],
      };
    else if (system.includes("生成2到3条"))
      output = {
        paths: [path("先拿到新机会再决定迁移", ids), path("留在当前城市进行短期探索", ids)],
      };
    else
      output = {
        title: "职业与城市选择",
        conditions: [{ kind: "goal", label: "希望获得的改变", value: "寻找成长空间" }],
        questions: ["你希望在什么时候推进这次选择？"],
      };
    if (mode.invalid && output.paths?.length) output.paths[0].conditionIds = ["foreign-condition"];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        id: `fixture-${calls}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "fixture",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(output) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
      }),
    );
  } catch {
    response.writeHead(500).end("Fixture request failed");
  }
});
server.listen(4010, "127.0.0.1", () =>
  console.log("Test-only model fixture listening at 127.0.0.1:4010"),
);
