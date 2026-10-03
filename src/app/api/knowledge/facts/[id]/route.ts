import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { deleteFact, updateFact } from "@/server/knowledge/service";
import { factUpdateSchema } from "@/validators/knowledge";

const id = z.string().uuid();

export const PATCH = route<{ id: string }>(async ({ params, body }) => {
  const row = await updateFact(id.parse(params.id), await body(factUpdateSchema));
  if (!row) throw notFound();
  return row;
});

export const DELETE = route<{ id: string }>(async ({ params }) => {
  await deleteFact(id.parse(params.id));
});
