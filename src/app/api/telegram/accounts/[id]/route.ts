import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { deleteAccount, getAccountRow, updateAccount } from "@/server/telegram/accounts";
import { disconnectAccount } from "@/server/telegram/connection";
import { updateAccountSchema } from "@/validators/telegram";

const idParam = z.object({ id: z.string().uuid() });

export const PATCH = route<{ id: string }>(async ({ params, body }) => {
  const { id } = idParam.parse(params);
  const updated = await updateAccount(id, await body(updateAccountSchema));
  if (!updated) throw notFound();
  return updated;
});

export const DELETE = route<{ id: string }>(async ({ params }) => {
  const { id } = idParam.parse(params);
  const row = await getAccountRow(id);
  if (!row) throw notFound();
  // Revoke the Telegram session before forgetting it.
  if (row.encryptedSession) await disconnectAccount(id);
  await deleteAccount(id);
});
