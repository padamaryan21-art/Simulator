import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { mapDomain } from "@/lib/api-errors";
import { deletePrompt, updatePrompt } from "@/server/prompts/service";
import { promptUpdateSchema } from "@/validators/prompts";

const idParam = z.object({ id: z.string().uuid() });

export const PATCH = route<{ id: string }>(async ({ params, body }) => {
  const patch = await body(promptUpdateSchema);
  const row = await mapDomain(() => updatePrompt(idParam.parse(params).id, patch));
  if (!row) throw notFound();
  return row;
});

export const DELETE = route<{ id: string }>(async ({ params }) => {
  await deletePrompt(idParam.parse(params).id);
});
