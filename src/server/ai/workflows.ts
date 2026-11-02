import "server-only";
import { generateDecisionObject } from "./provider";
import { decisionPrompts } from "./prompts";
import {
  aiOverviewSchema,
  pathsOutput,
  scenariosOutput,
  branchOutput,
  refreshOutput,
  summaryOutput,
} from "./schemas";
import type { Snapshot } from "../repositories/snapshot";

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
export function clarify(description: string, conditions: unknown) {
  return generateDecisionObject(aiOverviewSchema, decisionPrompts.clarify, {
    description,
    conditions,
  });
}

export function generatePaths(decision: Snapshot) {
  return generateDecisionObject(pathsOutput, decisionPrompts.paths, context(decision));
}
export function generateScenarios(decision: Snapshot, pathId: string) {
  return generateDecisionObject(scenariosOutput, decisionPrompts.scenarios, {
    ...context(decision),
    selectedPathId: pathId,
  });
}
export function generateBranch(decision: Snapshot, scenarioId: string, question: string) {
  return generateDecisionObject(branchOutput, decisionPrompts.branch, {
    ...context(decision),
    parentScenarioId: scenarioId,
    question,
  });
}
export function refresh(decision: Snapshot) {
  return generateDecisionObject(refreshOutput, decisionPrompts.refresh, context(decision));
}
export function generateSummary(decision: Snapshot) {
  return generateDecisionObject(summaryOutput, decisionPrompts.summary, context(decision));
}
