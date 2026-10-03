import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { deleteMemory, updateMemory } from "@/server/memory/memory";
import { MEMORY_SCOPES, memoryUpdateSchema } from "@/validators/personas";

const params = z.object({ scope: z.enum(MEMORY_SCOPES), id: z.string().uuid() });

export const PATCH = route<{ scope: string; id: string }>(async ({ params: raw, body }) => {
  const { scope, id } = params.parse(raw);
  const row = await updateMemory(scope, id, await body(memoryUpdateSchema));
  if (!row) throw notFound();
  return row;
});

export const DELETE = route<{ scope: string; id: string }>(async ({ params: raw }) => {
  const { scope, id } = params.parse(raw);
  await deleteMemory(scope, id);
});
