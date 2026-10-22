import { pathInputSchema } from "@/domain/decision/schemas";
import { writeRoute } from "@/server/route";
import { addPath } from "@/server/services/decisions";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return writeRoute(request, pathInputSchema, (owner, input) => addPath(id, owner, input));
}
