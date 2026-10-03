import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { deleteTopic, updateTopic } from "@/server/conversations/topics";
import { topicUpdateSchema } from "@/validators/topics";

const idParam = z.object({ id: z.string().uuid() });

export const PATCH = route<{ id: string }>(async ({ params, body }) => {
  const row = await updateTopic(idParam.parse(params).id, await body(topicUpdateSchema));
  if (!row) throw notFound();
  return row;
});

export const DELETE = route<{ id: string }>(async ({ params }) => {
  await deleteTopic(idParam.parse(params).id);
});
