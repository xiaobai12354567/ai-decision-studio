import { feedbackReviewSchema } from "@/domain/decision/schemas";
import { writeRoute } from "@/server/route";
import { reviewFeedback } from "@/server/services/decisions";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; feedbackId: string }> },
) {
  const { id, feedbackId } = await context.params;
  return writeRoute(request, feedbackReviewSchema, (owner, input) =>
    reviewFeedback(id, owner, feedbackId, input.expectedRevision),
  );
}
