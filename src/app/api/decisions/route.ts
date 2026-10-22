import { session } from "@/server/session";
import { db } from "@/server/db";
import { body, checkOrigin, failure } from "@/server/http";
import { createDecision } from "@/domain/decision/schemas";
import { getDecision, listDecisions } from "@/server/repositories/decisions";

export async function GET() {
  try {
    const owner = await session();
    return Response.json({ data: owner ? await listDecisions(owner.id) : [] });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = createDecision.parse(await body(request));
    const owner = (await session(true))!;
    const data = await db().decision.create({
      data: {
        sessionId: owner.id,
        description: input.description,
        title: input.description.slice(0, 32),
      },
      include: { conditions: true },
    });
    return Response.json({ data: await getDecision(data.id, owner.id) }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
