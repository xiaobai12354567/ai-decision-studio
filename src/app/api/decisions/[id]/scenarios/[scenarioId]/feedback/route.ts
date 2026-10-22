import { feedbackInputSchema } from "@/domain/decision/schemas";
import { writeRoute } from "@/server/route";
import { addFeedback } from "@/server/services/decisions";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; scenarioId: string }> },
) {
  const { id, scenarioId } = await context.params;
  return writeRoute(request, feedbackInputSchema, (owner, input) =>
    addFeedback(id, owner, scenarioId, input),
  );
}
