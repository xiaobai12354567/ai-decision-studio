import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { GenerationInput } from "@/domain/decision/schemas";
import { canBranch, dependencyIds } from "@/domain/decision/dependencies";
import { db } from "../db";
import { HttpError } from "../http";
import { change } from "../repositories/decisions";
import { dto, owned, type Snapshot, type Tx } from "../repositories/snapshot";
import { clarify } from "../ai/provider";
import * as ai from "../ai/workflows";

type RunInput = GenerationInput | { kind: "clarify"; expectedRevision: number; requestKey: string };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const promptVersion = "decision-mvp-v1";

async function reserve(id: string, owner: string, input: RunInput) {
  return db().$transaction(
    async (tx) => {
      // Session lock makes per-session quotas atomic across different decisions.
      await tx.$queryRaw`SELECT id FROM "VisitorSession" WHERE id = ${owner} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Decision" WHERE id = ${id} AND "sessionId" = ${owner} FOR UPDATE`;
      const decision = await owned(tx, id, owner);
      const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      const previous = await tx.generationRun.findUnique({
        where: { decisionId_requestKey: { decisionId: id, requestKey: input.requestKey } },
      });
      if (previous) {
        if (previous.requestHash !== hash)
          throw new HttpError(409, "同一请求编号不能用于不同的内容。");
        if (previous.status !== "succeeded")
          throw new HttpError(
            409,
            previous.status === "running"
              ? "这项生成仍在进行，请稍后刷新查看。"
              : "上次请求没有完成，请使用重试按钮重新发起。",
          );
        return { decision, run: previous, replay: true };
      }
      if (decision.revision !== input.expectedRevision)
        throw new HttpError(409, "内容已更新，请重新加载后再生成。");
      const cutoff = new Date(Date.now() - 120000);
      await tx.generationRun.updateMany({
        where: { decisionId: id, status: "running", startedAt: { lt: cutoff } },
        data: { status: "failed", errorCode: "INTERRUPTED", finishedAt: new Date() },
      });
      if (await tx.generationRun.count({ where: { decisionId: id, status: "running" } }))
        throw new HttpError(409, "本次决策正在生成其他内容，请等待完成。");
      const recent = await tx.generationRun.count({
        where: {
          decision: { sessionId: owner },
          startedAt: { gte: new Date(Date.now() - 3600000) },
        },
      });
      const daily = await tx.generationRun.count({
        where: {
          decision: { sessionId: owner },
          startedAt: { gte: new Date(Date.now() - 86400000) },
        },
      });
      if (recent >= 30 || daily >= 100)
        throw new HttpError(429, "本次浏览器会话的生成次数已达到限额，请稍后继续。");
      validateInput(decision, input);
      const run = await tx.generationRun.create({
        data: {
          decisionId: id,
          requestKey: input.requestKey,
          requestHash: hash,
          kind: input.kind,
          scopeId: "scopeId" in input ? input.scopeId : null,
          baseRevision: input.expectedRevision,
          model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
          promptVersion,
          inputSnapshot: json(ai.context(decision)),
        },
      });
      return { decision, run, replay: false };
    },
    { timeout: 10000 },
  );
}
function validateInput(decision: Snapshot, input: RunInput) {
  if (input.kind === "clarify") return;
  if (!decision.confirmedAt) throw new HttpError(400, "请先确认决策概况。");
  if (input.kind === "paths" && decision.paths.length)
    throw new HttpError(400, "已有路径会保留。请手动添加路径，或更新受影响内容。");
  if (input.kind === "scenarios") {
    const path = decision.paths.find((path) => path.id === input.scopeId);
    if (!path) throw new HttpError(404, "路径不存在。");
    if (path.freshness === "stale") throw new HttpError(400, "请先更新这条路径。");
    if (path.scenarios.length) throw new HttpError(400, "已有情境可以继续探索，无需重新生成。");
  }
  if (input.kind === "branch") {
    const path = decision.paths.find((path) => path.scenarios.some((s) => s.id === input.scopeId));
    const parent = path?.scenarios.find((s) => s.id === input.scopeId);
    if (!path || !parent) throw new HttpError(404, "情境不存在。");
    if (path.freshness === "stale" || parent.freshness === "stale")
      throw new HttpError(400, "请先更新相关路径和情境。");
    if (!canBranch(parent.depth, path.scenarios.length))
      throw new HttpError(400, "已达到六个情境或两层分支的上限。");
  }
  if (input.kind === "summary") {
    if (!decision.paths.length) throw new HttpError(400, "请先探索至少一条选择路径。");
    if (
      decision.paths.some(
        (p) => p.freshness === "stale" || p.scenarios.some((s) => s.freshness === "stale"),
      )
    )
      throw new HttpError(400, "请先更新受影响的路径和情境，再整理总结。");
  }
  if (
    input.kind === "refresh" &&
    !decision.paths.some(
      (p) => p.freshness === "stale" || p.scenarios.some((s) => s.freshness === "stale"),
    )
  )
    throw new HttpError(400, "目前没有需要更新的路径或情境。");
}
function dependencies(decision: Snapshot, proposed: string[]) {
  try {
    return dependencyIds(decision.conditions, proposed).map((id) => ({
      conditionId: id,
      conditionRevision: decision.conditions.find((c) => c.id === id)!.revision,
    }));
  } catch {
    throw new HttpError(502, "模型引用了无效条件，原内容已保留，请重试。");
  }
}
function exactIds(proposed: string[], required: string[]) {
  if (
    new Set(proposed).size !== proposed.length ||
    proposed.length !== required.length ||
    required.some((id) => !proposed.includes(id))
  )
    throw new HttpError(502, "模型未完整更新受影响内容，原内容已保留，请重试。");
}
async function scenarioCreate(
  tx: Tx,
  decision: Snapshot,
  pathId: string,
  data: ai.ScenariosOutput["scenarios"][number],
  revision: number,
  parentId?: string,
  depth = 0,
) {
  const { conditionIds, ...content } = data;
  return tx.scenario.create({
    data: {
      ...content,
      pathId,
      parentId,
      depth,
      basedOnRevision: revision,
      dependencies: { create: dependencies(decision, conditionIds) },
    },
  });
}

export async function generate(id: string, owner: string, input: RunInput) {
  const reserved = await reserve(id, owner, input);
  if (reserved.replay)
    return {
      data: dto(reserved.decision),
      candidate: input.kind === "clarify" ? reserved.run.candidateOutput : undefined,
    };
  try {
    const snapshot = reserved.decision;
    let output: unknown;
    switch (input.kind) {
      case "clarify":
        output = await clarify(snapshot.description, snapshot.conditions);
        break;
      case "paths":
        output = await ai.generatePaths(snapshot);
        break;
      case "scenarios":
        output = await ai.generateScenarios(snapshot, input.scopeId);
        break;
      case "branch":
        output = await ai.generateBranch(snapshot, input.scopeId, input.question);
        break;
      case "refresh":
        output = await ai.refresh(snapshot);
        break;
      case "summary":
        output = await ai.generateSummary(snapshot);
        break;
    }
    output = ai.readableReferences(output, snapshot);
    const committed = await db().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Decision" WHERE id = ${id} AND "sessionId" = ${owner} FOR UPDATE`;
        const current = await owned(tx, id, owner);
        const active = await tx.generationRun.findUniqueOrThrow({ where: { id: reserved.run.id } });
        if (current.revision !== input.expectedRevision || active.status !== "running") {
          await tx.generationRun.update({
            where: { id: active.id },
            data: { status: "superseded", candidateOutput: json(output), finishedAt: new Date() },
          });
          return { applied: false, data: dto(current) };
        }
        const revision = current.revision + (input.kind === "clarify" ? 0 : 1);
        if (input.kind !== "clarify") {
          await apply(tx, current, input, output, revision);
          await tx.decision.update({ where: { id }, data: { revision } });
        }
        await tx.generationRun.update({
          where: { id: active.id },
          data: { status: "succeeded", candidateOutput: json(output), finishedAt: new Date() },
        });
        return { applied: true, data: dto(await owned(tx, id, owner)) };
      },
      { timeout: 15000 },
    );
    if (!committed.applied)
      throw new HttpError(409, "生成期间条件发生变化，本次旧结果未应用，请检查新条件后重试。");
    return { data: committed.data, candidate: input.kind === "clarify" ? output : undefined };
  } catch (error) {
    await db().generationRun.updateMany({
      where: { id: reserved.run.id, status: "running" },
      data: {
        status: "failed",
        errorCode: error instanceof HttpError ? String(error.status) : "GENERATION_FAILED",
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

async function apply(
  tx: Tx,
  decision: Snapshot,
  input: GenerationInput,
  output: unknown,
  revision: number,
) {
  if (input.kind === "paths") {
    const data = ai.pathsOutput.parse(output);
    if (new Set(data.paths.map((p) => p.title.replace(/\s/g, ""))).size !== data.paths.length)
      throw new HttpError(502, "生成路径重复，请重试。");
    for (const path of data.paths) {
      const { conditionIds, ...content } = path;
      await tx.path.create({
        data: {
          ...content,
          decisionId: decision.id,
          basedOnRevision: revision,
          dependencies: { create: dependencies(decision, conditionIds) },
        },
      });
    }
    await change(
      tx,
      decision.id,
      revision,
      "generation",
      "已生成不同的选择路径，等待你探索和编辑。",
    );
  } else if (input.kind === "scenarios") {
    const data = ai.scenariosOutput.parse(output);
    for (const scenario of data.scenarios)
      await scenarioCreate(tx, decision, input.scopeId, scenario, revision);
    await change(
      tx,
      decision.id,
      revision,
      "generation",
      "已展开可能情境，请检查依据和假设。",
      input.scopeId,
    );
  } else if (input.kind === "branch") {
    const data = ai.branchOutput.parse(output);
    const path = decision.paths.find((p) => p.scenarios.some((s) => s.id === input.scopeId))!;
    const parent = path.scenarios.find((s) => s.id === input.scopeId)!;
    await scenarioCreate(
      tx,
      decision,
      path.id,
      data.scenario,
      revision,
      parent.id,
      parent.depth + 1,
    );
    await tx.feedback.create({
      data: {
        scenarioId: parent.id,
        scenarioRevision: parent.revision,
        kind: "question",
        text: input.question,
      },
    });
    await change(
      tx,
      decision.id,
      revision,
      "generation",
      "已根据你的问题展开一个后续情境。",
      parent.id,
    );
  } else if (input.kind === "refresh") {
    const data = ai.refreshOutput.parse(output);
    exactIds(
      data.paths.map((p) => p.id),
      decision.paths.filter((p) => p.freshness === "stale").map((p) => p.id),
    );
    exactIds(
      data.scenarios.map((s) => s.id),
      decision.paths
        .flatMap((p) => p.scenarios)
        .filter((s) => s.freshness === "stale")
        .map((s) => s.id),
    );
    for (const path of data.paths) {
      const { id, conditionIds, reason, ...content } = path;
      const before = decision.paths.find((p) => p.id === id)!;
      await tx.path.update({
        where: { id },
        data: {
          ...content,
          freshness: "fresh",
          staleReason: null,
          revision: { increment: 1 },
          basedOnRevision: revision,
        },
      });
      await tx.pathDependency.deleteMany({ where: { pathId: id } });
      await tx.pathDependency.createMany({
        data: dependencies(decision, conditionIds).map((d) => ({ pathId: id, ...d })),
      });
      await change(tx, decision.id, revision, "refresh", reason, id, before, content);
    }
    for (const scenario of data.scenarios) {
      const { id, conditionIds, reason, ...content } = scenario;
      const before = decision.paths.flatMap((p) => p.scenarios).find((s) => s.id === id)!;
      await tx.scenario.update({
        where: { id },
        data: {
          ...content,
          freshness: "fresh",
          staleReason: null,
          revision: { increment: 1 },
          basedOnRevision: revision,
        },
      });
      await tx.scenarioDependency.deleteMany({ where: { scenarioId: id } });
      await tx.scenarioDependency.createMany({
        data: dependencies(decision, conditionIds).map((d) => ({ scenarioId: id, ...d })),
      });
      await tx.feedback.updateMany({ where: { scenarioId: id }, data: { needsReview: true } });
      await change(tx, decision.id, revision, "refresh", reason, id, before, content);
    }
  } else if (input.kind === "summary") {
    const { actions, ...content } = ai.summaryOutput.parse(output);
    if (
      content.inclinationPathId &&
      !decision.paths.some((p) => p.id === content.inclinationPathId)
    )
      throw new HttpError(502, "模型总结引用了无效路径，原内容已保留。");
    await tx.action.updateMany({
      where: { decisionId: decision.id, status: "candidate" },
      data: { status: "superseded" },
    });
    const summary = await tx.summary.upsert({
      where: { decisionId: decision.id },
      create: { ...content, decisionId: decision.id, basedOnRevision: revision },
      update: { ...content, basedOnRevision: revision, freshness: "fresh", staleReason: null },
    });
    await tx.action.createMany({
      data: actions.map((action) => ({
        ...action,
        decisionId: decision.id,
        summaryId: summary.id,
      })),
    });
    await change(
      tx,
      decision.id,
      revision,
      "summary",
      "已结合你的反馈和行动结果更新总结。",
      summary.id,
    );
  }
  if (input.kind !== "summary")
    await tx.summary.updateMany({
      where: { decisionId: decision.id },
      data: { freshness: "stale", staleReason: "探索内容已更新，请重新整理总结。" },
    });
}
