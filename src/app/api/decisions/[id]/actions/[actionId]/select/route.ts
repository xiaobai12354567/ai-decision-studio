import { revisionSchema } from "@/domain/decision/schemas";
import { writeRoute } from "@/server/route";
import { selectAction } from "@/server/services/decisions";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; actionId: string }> },
) {
  const { id, actionId } = await context.params;
  return writeRoute(request, revisionSchema, (owner, input) =>
    selectAction(id, owner, actionId, input.expectedRevision),
  );
}
