import { session } from "@/server/session";
import { body, checkOrigin, failure, HttpError } from "@/server/http";
import { generate } from "@/server/services/generations";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const maxDuration = 100;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const input = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        requestKey: z.string().min(8).max(100).optional(),
      })
      .strict()
      .parse(await body(request));
    const owner = await session();
    if (!owner) throw new HttpError(401, "会话已失效。");
    const { id } = await context.params;
    const result = await generate(id, owner.id, {
      kind: "clarify",
      expectedRevision: input.expectedRevision,
      requestKey: input.requestKey || randomUUID(),
    });
    return Response.json({ data: result.candidate, baseRevision: input.expectedRevision });
  } catch (e) {
    return failure(e);
  }
}
