import "server-only";
import { z } from "zod";
import { pathContentSchema } from "@/domain/decision/schemas";
import { generateDecisionObject } from "./provider";
import type { Snapshot } from "../repositories/snapshot";

const text = z.string().min(1).max(600);
const list = z.array(text).max(6);
const dependency = { conditionIds: z.array(z.string()).max(10) };
export const generatedPath = pathContentSchema.extend(dependency);
export const generatedScenario = z.object({
  timeframe: z.string().min(1).max(100),
  event: z.string().min(1).max(200),
  changes: list,
  difficulties: list,
  assumptions: list,
  basis: list,
  ...dependency,
});
export const pathsOutput = z.object({ paths: z.array(generatedPath).min(2).max(3) });
export const scenariosOutput = z.object({ scenarios: z.array(generatedScenario).min(1).max(3) });
export const branchOutput = z.object({ scenario: generatedScenario });
export const refreshOutput = z.object({
  paths: z
    .array(generatedPath.extend({ id: z.string(), reason: z.string().min(1).max(500) }))
    .max(5),
  scenarios: z
    .array(generatedScenario.extend({ id: z.string(), reason: z.string().min(1).max(500) }))
    .max(30),
});
export const summaryOutput = z.object({
  inclinationPathId: z.string().nullable(),
  reason: z.string().min(1).max(2000),
  valuedBenefits: list,
  unacceptableCosts: list,
  unknowns: list,
  actions: z
    .array(z.object({ task: text, verification: text, decisionHelp: text }))
    .min(1)
    .max(3),
});
export type PathsOutput = z.infer<typeof pathsOutput>;
export type ScenariosOutput = z.infer<typeof scenariosOutput>;
export type BranchOutput = z.infer<typeof branchOutput>;
export type RefreshOutput = z.infer<typeof refreshOutput>;
export type SummaryOutput = z.infer<typeof summaryOutput>;

const system = `你是帮助用户推进职业与城市选择的决策探索助手。用简洁中文生成可编辑内容，列表每项尽量在60字以内。所有情境只是探索，不是预测；禁止编造成功率或确定性未来，也不要使用“风险最低”“一定适合”等缺少比较依据的结论。收益与代价表达可能性；用户尚未确认的家庭安排、预算和机会，不能断言不受影响或已经满足。用户未提供的信息只能作为待验证假设，不能伪装成事实。尊重预算、家庭等所有硬约束；如果无法满足必须说明冲突。只引用输入中真实存在的ID。内部ID只能出现在专用id/conditionIds/inclinationPathId字段，所有面向用户的文字仅使用条件名称或路径标题，不写ID。basis列出用户条件的依据，assumptions列出额外假设，conditionIds列出所引用条件ID。用户选择查看一条路径不代表倾向它。无需最终做决定，可以通过下一步行动减少不确定性。不要输出医疗、法律、投资专业结论。不展示隐式思维链。`;

export function readableReferences(value: unknown, decision: Snapshot, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => readableReferences(item, decision, key));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, readableReferences(item, decision, name)]),
    );
  if (
    typeof value !== "string" ||
    ["id", "parentId", "conditionIds", "inclinationPathId"].includes(key)
  )
    return value;
  const labels = [
    ...decision.conditions.map((condition) => [condition.id, condition.label]),
    ...decision.paths.map((path) => [path.id, path.title]),
    ...decision.paths.flatMap((path) =>
      path.scenarios.map((scenario) => [scenario.id, scenario.event]),
    ),
  ];
  return labels.reduce((text, [id, label]) => text.replaceAll(id, label), value);
}

export function context(decision: Snapshot) {
  return {
    title: decision.title,
    description: decision.description,
    conditions: decision.conditions.map(({ id, kind, label, value, confirmed }) => ({
      id,
      kind,
      label,
      value,
      confirmed,
    })),
    paths: decision.paths.map((path) => ({
      id: path.id,
      title: path.title,
      benefits: path.benefits,
      costs: path.costs,
      prerequisites: path.prerequisites,
      freshness: path.freshness,
      scenarios: path.scenarios.map((s) => ({
        id: s.id,
        parentId: s.parentId,
        timeframe: s.timeframe,
        event: s.event,
        changes: s.changes,
        difficulties: s.difficulties,
        assumptions: s.assumptions,
        basis: s.basis,
        freshness: s.freshness,
        feedback: s.feedback.map((f) => ({
          kind: f.kind,
          text: f.text,
          needsReview: f.needsReview,
        })),
      })),
    })),
    previousSummary: decision.summary
      ? { reason: decision.summary.reason, inclinationPathId: decision.summary.inclinationPathId }
      : null,
    actionHistory: decision.actions
      .filter((a) => ["selected", "completed"].includes(a.status))
      .map((a) => ({
        task: a.task,
        verification: a.verification,
        status: a.status,
        results: a.results.map((r) => r.text),
      })),
  };
}
export function generatePaths(decision: Snapshot) {
  return generateDecisionObject(
    pathsOutput,
    `${system}\n生成2到3条有实质差异的路径，包含一个可分阶段尝试的方案，写清收益、代价和关键前提。`,
    context(decision),
  );
}
export function generateScenarios(decision: Snapshot, pathId: string) {
  return generateDecisionObject(
    scenariosOutput,
    `${system}\n只为指定路径生成1到3个具体情境，每个包含明确时间点或事件。`,
    { ...context(decision), selectedPathId: pathId },
  );
}
export function generateBranch(decision: Snapshot, scenarioId: string, question: string) {
  return generateDecisionObject(
    branchOutput,
    `${system}\n围绕指定情境和用户问题，只生成一个后续情境，帮助理解可以如何应对。`,
    { ...context(decision), parentScenarioId: scenarioId, question },
  );
}
export function refresh(decision: Snapshot) {
  return generateDecisionObject(
    refreshOutput,
    `${system}\n仅更新输入中freshness=stale的路径和情境，必须完整覆盖全部这些ID，保持ID不变。不得返回fresh项目。为每项写明变化原因，遵守最新条件并保留用户反馈的含义，不替用户确认冲突。`,
    context(decision),
  );
}
export function generateSummary(decision: Snapshot) {
  return generateDecisionObject(
    summaryOutput,
    `${system}\n总结用户已表达的倾向及取舍；没有明确倾向时inclinationPathId必须为null。列出待确认信息以及1到3个具体可执行行动，分别写做什么、验证什么、完成后如何帮助判断。优先使用已完成行动的真实结果，避免重复已经完成的行动。`,
    context(decision),
  );
}
