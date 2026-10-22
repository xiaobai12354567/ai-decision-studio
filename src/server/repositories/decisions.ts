import "server-only";
import { db } from "../db";
import { HttpError } from "../http";
import type { OverviewInput } from "@/domain/decision/schemas";
import { dependentScenarioIds } from "@/domain/decision/dependencies";
import { dto, owned, snapshotInclude, type Snapshot, type Tx } from "./snapshot";

export async function listDecisions(sessionId: string) {
  const records = await db().decision.findMany({
    where: { sessionId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: snapshotInclude,
  });
  return records.map(dto);
}
export async function getDecision(id: string, sessionId: string) {
  await db().generationRun.updateMany({
    where: {
      decisionId: id,
      decision: { sessionId },
      status: "running",
      startedAt: { lt: new Date(Date.now() - 120000) },
    },
    data: { status: "failed", errorCode: "INTERRUPTED", finishedAt: new Date() },
  });
  return dto(await owned(db(), id, sessionId));
}

export async function mutation(
  id: string,
  sessionId: string,
  expectedRevision: number,
  work: (tx: Tx, before: Snapshot, revision: number) => Promise<void>,
) {
  return db().$transaction(
    async (tx) => {
      const before = await owned(tx, id, sessionId);
      const changed = await tx.decision.updateMany({
        where: { id, sessionId, revision: expectedRevision },
        data: { revision: { increment: 1 } },
      });
      if (!changed.count)
        throw new HttpError(409, "此决策已更新，请重新加载后合并修改。你的编辑仍保留在当前页面。");
      await work(tx, before, expectedRevision + 1);
      return dto(await owned(tx, id, sessionId));
    },
    { timeout: 10000 },
  );
}
export async function invalidate(
  tx: Tx,
  decision: Snapshot,
  affectedPaths: string[],
  affectedScenarios: string[],
  reason: string,
) {
  const scenarioIds = dependentScenarioIds(
    decision.paths.flatMap((path) => path.scenarios),
    affectedScenarios,
    affectedPaths,
  );
  if (affectedPaths.length)
    await tx.path.updateMany({
      where: { id: { in: affectedPaths } },
      data: { freshness: "stale", staleReason: reason },
    });
  if (scenarioIds.length) {
    await tx.scenario.updateMany({
      where: { id: { in: scenarioIds } },
      data: { freshness: "stale", staleReason: reason },
    });
    await tx.feedback.updateMany({
      where: { scenarioId: { in: scenarioIds } },
      data: { needsReview: true },
    });
  }
  await tx.summary.updateMany({
    where: { decisionId: decision.id },
    data: { freshness: "stale", staleReason: reason },
  });
}
export async function change(
  tx: Tx,
  decisionId: string,
  revision: number,
  kind: string,
  reason: string,
  entityId?: string,
  before?: unknown,
  after?: unknown,
) {
  await tx.decisionChange.create({
    data: {
      decisionId,
      revision,
      kind,
      reason,
      entityId,
      ...(before === undefined ? {} : { before: JSON.parse(JSON.stringify(before)) }),
      ...(after === undefined ? {} : { after: JSON.parse(JSON.stringify(after)) }),
    },
  });
}

export async function saveOverview(id: string, sessionId: string, input: OverviewInput) {
  return mutation(id, sessionId, input.expectedRevision, async (tx, before, revision) => {
    const changedIds: string[] = [];
    let newConstraint = false;
    for (const condition of input.conditions) {
      const previous = before.conditions.find((item) => item.kind === condition.kind);
      if (previous) {
        if (previous.value !== condition.value) changedIds.push(previous.id);
        if (!previous.value.trim() && condition.value.trim()) newConstraint = true;
        await tx.condition.update({
          where: { id: previous.id },
          data: {
            ...condition,
            source: "user",
            confirmed: input.confirm,
            revision: { increment: previous.value === condition.value ? 0 : 1 },
          },
        });
      } else {
        await tx.condition.create({
          data: { ...condition, decisionId: id, confirmed: input.confirm },
        });
        if (condition.value.trim()) newConstraint = true;
      }
    }
    for (const condition of before.conditions)
      if (!input.conditions.some((next) => next.kind === condition.kind)) {
        if (condition.value) changedIds.push(condition.id);
        await tx.condition.update({
          where: { id: condition.id },
          data: { value: "", confirmed: input.confirm, revision: { increment: 1 } },
        });
      }
    const reason = newConstraint
      ? "新增了决策条件，需要重新检查这些内容。"
      : `条件已变化：${before.conditions
          .filter((item) => changedIds.includes(item.id))
          .map((item) => item.label)
          .join("、")}。`;
    if (changedIds.length || newConstraint) {
      const paths = before.paths
        .filter(
          (path) =>
            newConstraint ||
            path.dependencies.length === 0 ||
            path.dependencies.some((dep) => changedIds.includes(dep.conditionId)),
        )
        .map((path) => path.id);
      const scenarios = before.paths
        .flatMap((path) => path.scenarios)
        .filter(
          (scenario) =>
            newConstraint ||
            scenario.dependencies.length === 0 ||
            scenario.dependencies.some((dep) => changedIds.includes(dep.conditionId)),
        )
        .map((scenario) => scenario.id);
      await invalidate(tx, before, paths, scenarios, reason);
      await change(
        tx,
        id,
        revision,
        "conditions",
        reason,
        undefined,
        before.conditions,
        input.conditions,
      );
    }
    const keepStage = ["action_selected", "revisiting"].includes(before.stage)
      ? before.stage
      : "exploring";
    await tx.decision.update({
      where: { id },
      data: {
        title: input.title,
        confirmedAt: input.confirm ? before.confirmedAt || new Date() : null,
        stage: input.confirm ? keepStage : "draft",
      },
    });
  });
}
