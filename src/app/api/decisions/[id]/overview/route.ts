import { session } from "@/server/session";
import { body, checkOrigin, failure, HttpError } from "@/server/http";
import { overviewSchema } from "@/domain/decision/schemas";
import { saveOverview } from "@/server/repositories/decisions";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const owner = await session();
    if (!owner) throw new HttpError(401, "浏览器会话已失效。");
    const input = overviewSchema.parse(await body(request));
    if (new Set(input.conditions.map((c) => c.kind)).size !== input.conditions.length)
      throw new HttpError(400, "条件类型不能重复。");
    return Response.json({ data: await saveOverview((await context.params).id, owner.id, input) });
  } catch (e) {
    return failure(e);
  }
}
