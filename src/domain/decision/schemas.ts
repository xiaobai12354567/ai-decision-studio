import { z } from "zod";

export const createDecision = z.object({
  description: z.string().trim().min(10, "请至少描述 10 个字").max(4000, "请控制在 4000 字以内"),
});
export const conditionSchema = z.object({
  kind: z.enum(["goal", "options", "budget", "family", "concern"]),
  label: z.string().trim().min(1).max(40),
  value: z.string().trim().max(1000),
});
export const overviewSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(100),
    conditions: z.array(conditionSchema).max(10),
    confirm: z.boolean().default(false),
  })
  .strict()
  .refine(
    (value) => new Set(value.conditions.map((item) => item.kind)).size === value.conditions.length,
    "条件类型不能重复",
  );
export const aiOverviewSchema = z.object({
  title: z.string().min(1).max(100),
  conditions: z.array(conditionSchema).max(10),
  questions: z.array(z.string().max(200)).max(3),
});
export type OverviewInput = z.infer<typeof overviewSchema>;
export type AiOverview = z.infer<typeof aiOverviewSchema>;
export const revisionSchema = z
  .object({ expectedRevision: z.number().int().nonnegative() })
  .strict();
const lines = z.array(z.string().trim().min(1).max(600)).max(8);
export const pathContentSchema = z
  .object({
    title: z.string().trim().min(2).max(100),
    benefits: lines,
    costs: lines,
    prerequisites: lines,
  })
  .strict();
export const pathInputSchema = pathContentSchema
  .extend({ expectedRevision: z.number().int().nonnegative() })
  .strict();
export const feedbackInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    kind: z.enum(["feeling", "correction", "question"]),
    text: z.string().trim().min(1).max(2000),
  })
  .strict();
export const feedbackReviewSchema = z
  .object({ expectedRevision: z.number().int().nonnegative(), needsReview: z.literal(false) })
  .strict();
export const summaryInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    inclinationPathId: z.string().min(1).max(100).nullable(),
    reason: z.string().trim().max(2000),
    valuedBenefits: lines,
    unacceptableCosts: lines,
    unknowns: lines,
  })
  .strict();
export const actionResultSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    text: z.string().trim().min(3).max(4000),
  })
  .strict();
const generationBase = {
  expectedRevision: z.number().int().nonnegative(),
  requestKey: z.string().trim().min(8).max(100),
};
export const generationInputSchema = z.discriminatedUnion("kind", [
  z.object({ ...generationBase, kind: z.literal("paths") }).strict(),
  z
    .object({
      ...generationBase,
      kind: z.literal("scenarios"),
      scopeId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      ...generationBase,
      kind: z.literal("branch"),
      scopeId: z.string().min(1).max(100),
      question: z.string().trim().min(3).max(1000),
    })
    .strict(),
  z.object({ ...generationBase, kind: z.literal("refresh") }).strict(),
  z.object({ ...generationBase, kind: z.literal("summary") }).strict(),
]);
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type PathInput = z.infer<typeof pathInputSchema>;
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
export type SummaryInput = z.infer<typeof summaryInputSchema>;
export type Freshness = "fresh" | "stale";
export type FeedbackView = {
  id: string;
  kind: "feeling" | "correction" | "question";
  text: string;
  scenarioRevision: number;
  needsReview: boolean;
  createdAt: string;
};
export type ScenarioView = {
  id: string;
  pathId: string;
  parentId: string | null;
  depth: number;
  timeframe: string;
  event: string;
  changes: string[];
  difficulties: string[];
  assumptions: string[];
  basis: string[];
  revision: number;
  freshness: Freshness;
  staleReason: string | null;
  feedback: FeedbackView[];
};
export type PathView = {
  id: string;
  title: string;
  benefits: string[];
  costs: string[];
  prerequisites: string[];
  revision: number;
  freshness: Freshness;
  staleReason: string | null;
  scenarios: ScenarioView[];
};
export type ActionView = {
  id: string;
  task: string;
  verification: string;
  decisionHelp: string;
  status: "candidate" | "selected" | "completed" | "superseded";
  selectedAt: string | null;
  results: { id: string; text: string; createdAt: string }[];
};
export type SummaryView = {
  id: string;
  inclinationPathId: string | null;
  reason: string;
  valuedBenefits: string[];
  unacceptableCosts: string[];
  unknowns: string[];
  freshness: Freshness;
  staleReason: string | null;
  actions: ActionView[];
};
export type GenerationRunView = {
  id: string;
  kind: string;
  scopeId: string | null;
  baseRevision: number;
  status: string;
  provider: string;
  model: string;
  errorCode: string | null;
  startedAt: string;
  finishedAt: string | null;
};
export type DecisionChangeView = {
  id: string;
  revision: number;
  kind: string;
  entityId: string | null;
  reason: string;
  createdAt: string;
  details: { label: string; before: string; after: string }[];
};
export type DecisionView = {
  id: string;
  title: string;
  description: string;
  revision: number;
  stage: string;
  updatedAt: string;
  confirmedAt: string | null;
  conditions: (z.infer<typeof conditionSchema> & { id: string; confirmed: boolean })[];
  paths: PathView[];
  summary: SummaryView | null;
  actionHistory: ActionView[];
  generationRuns: GenerationRunView[];
  changes: DecisionChangeView[];
};
