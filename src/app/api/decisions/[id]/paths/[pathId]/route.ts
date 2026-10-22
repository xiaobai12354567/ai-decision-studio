import { pathInputSchema, revisionSchema } from "@/domain/decision/schemas";
import { writeRoute } from "@/server/route";
import { deletePath, updatePath } from "@/server/services/decisions";
type Context = { params: Promise<{ id: string; pathId: string }> };
export async function PATCH(request: Request, context: Context) {
  const { id, pathId } = await context.params;
  return writeRoute(request, pathInputSchema, (owner, input) =>
    updatePath(id, owner, pathId, input),
  );
}
export async function DELETE(request: Request, context: Context) {
  const { id, pathId } = await context.params;
  return writeRoute(request, revisionSchema, (owner, input) =>
    deletePath(id, owner, pathId, input.expectedRevision),
  );
}
