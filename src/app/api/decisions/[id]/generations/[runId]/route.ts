import { getDecision } from "@/server/repositories/decisions";
import { failure, HttpError } from "@/server/http";
import { session } from "@/server/session";
export async function GET(_: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  try {
    const owner = await session();
    if (!owner) throw new HttpError(404, "任务不存在。");
    const { id, runId } = await context.params;
    const snapshot = await getDecision(id, owner.id);
    const run = snapshot.generationRuns.find((item) => item.id === runId);
    if (!run) throw new HttpError(404, "任务不在最近的任务记录中。");
    return Response.json({ data: run });
  } catch (error) {
    return failure(error);
  }
}
