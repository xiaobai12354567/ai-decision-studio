import "server-only";
import { change, invalidate, mutation } from "../repositories/decisions";
import { HttpError } from "../http";
import type { FeedbackInput, PathInput, SummaryInput } from "@/domain/decision/schemas";

export function addPath(id: string, owner: string, input: PathInput) {
  return mutation(id, owner, input.expectedRevision, async (tx, decision, revision) => {
    if (!decision.confirmedAt) throw new HttpError(400, "请先确认决策概况。");
    if (decision.paths.length >= 5)
      throw new HttpError(400, "最多保留五条路径，请先整理已有选项。");
    const { expectedRevision: _, ...content } = input;
    const path = await tx.path.create({
      data: {
        ...content,
        decisionId: id,
        basedOnRevision: revision,
        dependencies: {
          create: decision.conditions.map((c) => ({
            conditionId: c.id,
            conditionRevision: c.revision,
          })),
        },
      },
    });
    await tx.summary.updateMany({
      where: { decisionId: id },
      data: { freshness: "stale", staleReason: "新增了选择路径，请重新整理总结。" },
    });
    await change(tx, id, revision, "path", "你新增了一条选择路径。", path.id, undefined, content);
  });
}
export function updatePath(id: string, owner: string, pathId: string, input: PathInput) {
  return mutation(id, owner, input.expectedRevision, async (tx, decision, revision) => {
    const path = decision.paths.find((p) => p.id === pathId);
    if (!path) throw new HttpError(404, "路径不存在。");
    const { expectedRevision: _, ...content } = input;
    await invalidate(
      tx,
      decision,
      [],
      path.scenarios.map((s) => s.id),
      "路径内容已编辑，请重新检查情境与总结。",
    );
    await tx.path.update({
      where: { id: pathId },
      data: {
        ...content,
        revision: { increment: 1 },
        basedOnRevision: revision,
        freshness: "fresh",
        staleReason: null,
      },
    });
    await tx.pathDependency.deleteMany({ where: { pathId } });
    await tx.pathDependency.createMany({
      data: decision.conditions.map((c) => ({
        pathId,
        conditionId: c.id,
        conditionRevision: c.revision,
      })),
    });
    await change(
      tx,
      id,
      revision,
      "path",
      "你修改了选择路径，相关情境已标为待更新。",
      pathId,
      path,
      content,
    );
  });
}
export function deletePath(id: string, owner: string, pathId: string, expectedRevision: number) {
  return mutation(id, owner, expectedRevision, async (tx, decision, revision) => {
    if (!decision.paths.some((path) => path.id === pathId))
      throw new HttpError(404, "路径不存在。");
    await tx.path.update({ where: { id: pathId }, data: { deletedAt: new Date() } });
    await tx.summary.updateMany({
      where: { decisionId: id },
      data: {
        freshness: "stale",
        staleReason: "选择路径已删除，请重新检查倾向和行动。",
        ...(decision.summary?.inclinationPathId === pathId ? { inclinationPathId: null } : {}),
      },
    });
    await change(tx, id, revision, "path", "路径已退出当前探索，历史情境和反馈仍保留。", pathId);
  });
}
export function addFeedback(id: string, owner: string, scenarioId: string, input: FeedbackInput) {
  return mutation(id, owner, input.expectedRevision, async (tx, decision, revision) => {
    const scenario = decision.paths
      .flatMap((path) => path.scenarios)
      .find((s) => s.id === scenarioId);
    if (!scenario) throw new HttpError(404, "情境不存在。");
    await tx.feedback.create({
      data: {
        scenarioId,
        scenarioRevision: scenario.revision,
        kind: input.kind,
        text: input.text,
        needsReview: scenario.freshness === "stale",
      },
    });
    if (input.kind === "correction")
      await invalidate(
        tx,
        decision,
        [],
        [scenarioId],
        "你纠正了情境假设，相关情境需要按新反馈更新。",
      );
    await tx.summary.updateMany({
      where: { decisionId: id },
      data: { freshness: "stale", staleReason: "你补充了新的想法，请重新整理取舍。" },
    });
    await change(tx, id, revision, "feedback", "已记录你对情境的想法。", scenarioId);
  });
}
export function reviewFeedback(
  id: string,
  owner: string,
  feedbackId: string,
  expectedRevision: number,
) {
  return mutation(id, owner, expectedRevision, async (tx, decision) => {
    const scenario = decision.paths
      .flatMap((p) => p.scenarios)
      .find((s) => s.feedback.some((f) => f.id === feedbackId));
    if (!scenario) throw new HttpError(404, "反馈不存在。");
    if (scenario.freshness !== "fresh") throw new HttpError(400, "请先更新情境，再重新确认反馈。");
    await tx.feedback.update({
      where: { id: feedbackId },
      data: { needsReview: false, scenarioRevision: scenario.revision },
    });
    await tx.summary.updateMany({
      where: { decisionId: id },
      data: { freshness: "stale", staleReason: "反馈已重新确认，可以更新总结。" },
    });
  });
}
export function editSummary(id: string, owner: string, input: SummaryInput) {
  return mutation(id, owner, input.expectedRevision, async (tx, decision, revision) => {
    if (!decision.summary) throw new HttpError(404, "请先生成一份总结。");
    if (input.inclinationPathId && !decision.paths.some((p) => p.id === input.inclinationPathId))
      throw new HttpError(400, "倾向的路径已不存在。");
    const { expectedRevision: _, ...data } = input;
    await tx.summary.update({
      where: { decisionId: id },
      data: { ...data, basedOnRevision: revision },
    });
    await change(tx, id, revision, "summary", "你修改了决策总结。", decision.summary.id);
  });
}
export function selectAction(
  id: string,
  owner: string,
  actionId: string,
  expectedRevision: number,
) {
  return mutation(id, owner, expectedRevision, async (tx, decision, revision) => {
    if (!decision.summary || decision.summary.freshness !== "fresh")
      throw new HttpError(400, "请先更新总结，再选择下一步行动。");
    const action = decision.actions.find((a) => a.id === actionId);
    if (!action || !["candidate", "selected"].includes(action.status))
      throw new HttpError(400, "请选择当前可执行的行动。");
    await tx.action.updateMany({
      where: { decisionId: id, status: "selected" },
      data: { status: "candidate" },
    });
    await tx.action.update({
      where: { id: actionId },
      data: { status: "selected", selectedAt: new Date() },
    });
    await tx.decision.update({ where: { id }, data: { stage: "action_selected" } });
    await change(tx, id, revision, "action", "已选定一个下一步行动。", actionId);
  });
}
export function recordResult(
  id: string,
  owner: string,
  actionId: string,
  expectedRevision: number,
  text: string,
) {
  return mutation(id, owner, expectedRevision, async (tx, decision, revision) => {
    const action = decision.actions.find((a) => a.id === actionId);
    if (!action || !["selected", "completed"].includes(action.status))
      throw new HttpError(400, "请先选定这个行动，再记录结果。");
    await tx.actionResult.create({ data: { actionId, text } });
    await tx.action.update({ where: { id: actionId }, data: { status: "completed" } });
    await tx.decision.update({ where: { id }, data: { stage: "revisiting" } });
    await tx.summary.updateMany({
      where: { decisionId: id },
      data: { freshness: "stale", staleReason: "行动有了新结果，更新总结后再判断下一步。" },
    });
    await change(tx, id, revision, "result", "已记录行动结果，原行动历史会保留。", actionId);
  });
}
