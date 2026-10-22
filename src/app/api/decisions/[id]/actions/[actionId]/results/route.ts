import { actionResultSchema } from "@/domain/decision/schemas";
import { writeRoute } from "@/server/route";
import { recordResult } from "@/server/services/decisions";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; actionId: string }> },
) {
  const { id, actionId } = await context.params;
  return writeRoute(request, actionResultSchema, (owner, input) =>
    recordResult(id, owner, actionId, input.expectedRevision, input.text),
  );
}
