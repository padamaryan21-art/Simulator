import { z } from "zod";
import { HttpError, notFound, route } from "@/lib/api";
import { GroupRuleError, deleteGroup, updateGroup } from "@/server/groups/groups";
import { updateGroupSchema } from "@/validators/telegram";

const idParam = z.object({ id: z.string().uuid() });

export const PATCH = route<{ id: string }>(async ({ params, body }) => {
  const { id } = idParam.parse(params);
  try {
    const row = await updateGroup(id, await body(updateGroupSchema));
    if (!row) throw notFound();
    return row;
  } catch (err) {
    if (err instanceof GroupRuleError) throw new HttpError(400, err.message);
    throw err;
  }
});

export const DELETE = route<{ id: string }>(async ({ params }) => {
  await deleteGroup(idParam.parse(params).id);
});
