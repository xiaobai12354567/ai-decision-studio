import "server-only";
import { z } from "zod";
import { pathContentSchema } from "@/domain/decision/schemas";

// The overview contract is shared with the client; reuse its definition.
export { aiOverviewSchema } from "@/domain/decision/schemas";

const text = z.string().min(1).max(600);
const list = z.array(text).max(6);
const dependency = { conditionIds: z.array(z.string()).max(10) };
export const generatedPath = pathContentSchema.extend(dependency);
export const generatedScenario = z.object({
  timeframe: z.string().min(1).max(100),
  event: z.string().min(1).max(200),
  changes: list,
  difficulties: list,
  assumptions: list,
  basis: list,
  ...dependency,
});
export const pathsOutput = z.object({ paths: z.array(generatedPath).min(2).max(3) });
export const scenariosOutput = z.object({ scenarios: z.array(generatedScenario).min(1).max(3) });
export const branchOutput = z.object({ scenario: generatedScenario });
export const refreshOutput = z.object({
  paths: z
    .array(generatedPath.extend({ id: z.string(), reason: z.string().min(1).max(500) }))
    .max(5),
  scenarios: z
    .array(generatedScenario.extend({ id: z.string(), reason: z.string().min(1).max(500) }))
    .max(30),
});
export const summaryOutput = z.object({
  inclinationPathId: z.string().nullable(),
  reason: z.string().min(1).max(2000),
  valuedBenefits: list,
  unacceptableCosts: list,
  unknowns: list,
  actions: z
    .array(z.object({ task: text, verification: text, decisionHelp: text }))
    .min(1)
    .max(3),
});
export type PathsOutput = z.infer<typeof pathsOutput>;
export type ScenariosOutput = z.infer<typeof scenariosOutput>;
export type BranchOutput = z.infer<typeof branchOutput>;
export type RefreshOutput = z.infer<typeof refreshOutput>;
export type SummaryOutput = z.infer<typeof summaryOutput>;
