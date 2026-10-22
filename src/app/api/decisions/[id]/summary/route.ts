import { summaryInputSchema } from "@/domain/decision/schemas";
import { writeRoute } from "@/server/route";
import { editSummary } from "@/server/services/decisions";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return writeRoute(request, summaryInputSchema, (owner, input) => editSummary(id, owner, input));
}
