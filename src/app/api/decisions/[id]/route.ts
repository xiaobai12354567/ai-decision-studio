import { session } from "@/server/session";
import { failure, HttpError } from "@/server/http";
import { getDecision } from "@/server/repositories/decisions";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await session();
    if (!owner) throw new HttpError(404, "当前浏览器中没有这份决策。");
    return Response.json({ data: await getDecision((await context.params).id, owner.id) });
  } catch (e) {
    return failure(e);
  }
}
