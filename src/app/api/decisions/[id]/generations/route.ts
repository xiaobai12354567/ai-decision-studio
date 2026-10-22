import { generationInputSchema } from "@/domain/decision/schemas";
import { body, checkOrigin, failure, HttpError } from "@/server/http";
import { session } from "@/server/session";
import { generate } from "@/server/services/generations";
export const maxDuration = 100;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const owner = await session();
    if (!owner) throw new HttpError(401, "浏览器会话已失效。");
    const input = generationInputSchema.parse(await body(request));
    return Response.json(await generate((await context.params).id, owner.id, input));
  } catch (error) {
    return failure(error);
  }
}
