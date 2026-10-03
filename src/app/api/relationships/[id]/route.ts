import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { deleteRelationship, updateRelationship } from "@/server/personas/relationships";
import { relationshipUpdateSchema } from "@/validators/personas";

const idParam = z.object({ id: z.string().uuid() });

export const PATCH = route<{ id: string }>(async ({ params, body }) => {
  const row = await updateRelationship(
    idParam.parse(params).id,
    await body(relationshipUpdateSchema),
  );
  if (!row) throw notFound();
  return row;
});

export const DELETE = route<{ id: string }>(async ({ params }) => {
  await deleteRelationship(idParam.parse(params).id);
});
