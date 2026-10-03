import { z } from "zod";
import { mapDomain } from "@/lib/api-errors";
import { route } from "@/lib/api";
import { deleteMessage, editMessage } from "@/server/conversations/service";
import { messageEditSchema } from "@/validators/conversations";

const id = z.string().uuid();

export const PATCH = route<{ id: string }>(async ({ params, body }) => {
  const patch = await body(messageEditSchema);
  return mapDomain(() => editMessage(id.parse(params.id), patch));
});

export const DELETE = route<{ id: string }>(async ({ params }) => {
  await mapDomain(() => deleteMessage(id.parse(params.id)));
});
