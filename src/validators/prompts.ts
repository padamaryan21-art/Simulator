import { z } from "zod";
import { specProblem } from "@/lib/prompts/build";
import { patchSchema } from "./patch";

const situation = z.object({
  label: z.string().trim().min(1).max(80),
  detail: z.string().trim().min(1).max(300),
});

const base = z.object({
  title: z.string().trim().min(1).max(120),
  topic: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).default(""),
  situations: z.array(situation).min(1).max(40),
  notes: z.string().trim().max(1200).default(""),
  conversations: z.number().int().min(1).max(300).default(80),
  linesMin: z.number().int().min(5).max(60).default(26),
  linesMax: z.number().int().min(5).max(60).default(36),
  batchSize: z.number().int().min(1).max(10).default(5),
});

/** Every prompt, new or edited, must be able to produce 2,000+ lines. */
const check = (v: z.infer<typeof base>, ctx: z.RefinementCtx) => {
  const problem = specProblem(v);
  if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["conversations"] });
};

export const promptSchema = base.superRefine(check);
export type PromptInput = z.infer<typeof promptSchema>;
export const promptUpdateSchema = patchSchema(base);
