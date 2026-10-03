import { route } from "@/lib/api";
import { BUILTIN_PROMPTS } from "@/lib/prompts/builtin";
import { createPrompt, listCustomPrompts } from "@/server/prompts/service";
import { promptSchema } from "@/validators/prompts";

export const GET = route(async () => ({
  builtin: BUILTIN_PROMPTS,
  custom: await listCustomPrompts(),
}));

export const POST = route(async ({ body }) => createPrompt(await body(promptSchema)), {
  rateLimit: { limit: 30, windowSec: 60 },
});
