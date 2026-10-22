import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DecisionView } from "@/domain/decision/schemas";
import { HttpError } from "../http";

export type Tx = Prisma.TransactionClient;
export const snapshotInclude = {
  conditions: { orderBy: { kind: "asc" as const } },
  paths: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" as const },
    include: {
      dependencies: true,
      scenarios: {
        orderBy: { createdAt: "asc" as const },
        include: { dependencies: true, feedback: { orderBy: { createdAt: "asc" as const } } },
      },
    },
  },
  summary: true,
  actions: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: { results: { orderBy: { createdAt: "asc" as const } } },
  },
  generationRuns: { orderBy: { startedAt: "desc" as const }, take: 15 },
  changes: { orderBy: { revision: "desc" as const }, take: 30 },
} satisfies Prisma.DecisionInclude;
export type Snapshot = Prisma.DecisionGetPayload<{ include: typeof snapshotInclude }>;

export async function owned(tx: Tx, id: string, sessionId: string): Promise<Snapshot> {
  const found = await tx.decision.findFirst({ where: { id, sessionId }, include: snapshotInclude });
  if (!found) throw new HttpError(404, "决策不存在或不属于当前浏览器会话。");
  return found;
}
function differences(before: unknown, after: unknown) {
  const result: { label: string; before: string; after: string }[] = [];
  if (Array.isArray(before) && Array.isArray(after)) {
    for (const item of after) {
      if (!item || typeof item !== "object" || typeof item.kind !== "string") continue;
      const previous = before.find((value) => value?.kind === item.kind);
      if ((previous?.value || "") !== (item.value || ""))
        result.push({
          label: String(item.label || item.kind),
          before: String(previous?.value || "未填写"),
          after: String(item.value || "未填写"),
        });
    }
  } else if (before && after && typeof before === "object" && typeof after === "object") {
    const labels: Record<string, string> = {
      title: "路径",
      benefits: "收益",
      costs: "代价",
      prerequisites: "关键前提",
      timeframe: "时间点",
      event: "情境",
      changes: "可能变化",
      difficulties: "困难",
      assumptions: "假设",
      basis: "依据",
    };
    const previous = before as Record<string, unknown>,
      next = after as Record<string, unknown>;
    const text = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item) => typeof item === "string").join("；")
        : typeof value === "string"
          ? value
          : "";
    for (const [key, label] of Object.entries(labels))
      if (key in next && text(previous[key]) !== text(next[key]))
        result.push({
          label,
          before: text(previous[key]) || "未填写",
          after: text(next[key]) || "未填写",
        });
  }
  return result;
}
export function dto(item: Snapshot): DecisionView {
  const actions = item.actions.map((action) => ({
    id: action.id,
    task: action.task,
    verification: action.verification,
    decisionHelp: action.decisionHelp,
    status: action.status as "candidate" | "selected" | "completed" | "superseded",
    selectedAt: action.selectedAt?.toISOString() || null,
    results: action.results.map((result) => ({
      id: result.id,
      text: result.text,
      createdAt: result.createdAt.toISOString(),
    })),
  }));
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    stage: item.stage,
    revision: item.revision,
    updatedAt: item.updatedAt.toISOString(),
    confirmedAt: item.confirmedAt?.toISOString() || null,
    conditions: item.conditions.map((condition) => ({
      id: condition.id,
      kind: condition.kind as DecisionView["conditions"][number]["kind"],
      label: condition.label,
      value: condition.value,
      confirmed: condition.confirmed,
    })),
    paths: item.paths.map((path) => ({
      id: path.id,
      title: path.title,
      benefits: path.benefits,
      costs: path.costs,
      prerequisites: path.prerequisites,
      revision: path.revision,
      freshness: path.freshness as "fresh" | "stale",
      staleReason: path.staleReason,
      scenarios: path.scenarios.map((scenario) => ({
        id: scenario.id,
        pathId: path.id,
        parentId: scenario.parentId,
        depth: scenario.depth,
        timeframe: scenario.timeframe,
        event: scenario.event,
        changes: scenario.changes,
        difficulties: scenario.difficulties,
        assumptions: scenario.assumptions,
        basis: scenario.basis,
        revision: scenario.revision,
        freshness: scenario.freshness as "fresh" | "stale",
        staleReason: scenario.staleReason,
        feedback: scenario.feedback.map((feedback) => ({
          id: feedback.id,
          kind: feedback.kind as "feeling" | "correction" | "question",
          text: feedback.text,
          scenarioRevision: feedback.scenarioRevision,
          needsReview: feedback.needsReview,
          createdAt: feedback.createdAt.toISOString(),
        })),
      })),
    })),
    summary: item.summary
      ? {
          id: item.summary.id,
          inclinationPathId: item.summary.inclinationPathId,
          reason: item.summary.reason,
          valuedBenefits: item.summary.valuedBenefits,
          unacceptableCosts: item.summary.unacceptableCosts,
          unknowns: item.summary.unknowns,
          freshness: item.summary.freshness as "fresh" | "stale",
          staleReason: item.summary.staleReason,
          actions: actions.filter((action) => action.status !== "superseded"),
        }
      : null,
    actionHistory: actions.filter(
      (action) => action.status === "completed" || action.status === "selected",
    ),
    generationRuns: item.generationRuns.map((run) => ({
      id: run.id,
      kind: run.kind,
      scopeId: run.scopeId,
      baseRevision: run.baseRevision,
      status: run.status,
      provider: run.provider,
      model: run.model,
      errorCode: run.errorCode,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() || null,
    })),
    changes: item.changes.map((change) => ({
      id: change.id,
      revision: change.revision,
      kind: change.kind,
      entityId: change.entityId,
      reason: change.reason,
      createdAt: change.createdAt.toISOString(),
      details: differences(change.before, change.after),
    })),
  };
}
