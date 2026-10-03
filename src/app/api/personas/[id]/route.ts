import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { deletePersona, updatePersona } from "@/server/personas/personas";
import { personaUpdateSchema } from "@/validators/personas";

const idParam = z.object({ id: z.string().uuid() });

export const PATCH = route<{ id: string }>(async ({ params, body }) => {
  const row = await updatePersona(idParam.parse(params).id, await body(personaUpdateSchema));
  if (!row) throw notFound();
  return row;
});

export const DELETE = route<{ id: string }>(async ({ params }) => {
  await deletePersona(idParam.parse(params).id);
});
