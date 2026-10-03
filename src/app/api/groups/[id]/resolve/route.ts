import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { HttpError, notFound, route } from "@/lib/api";
import { resolveGroup } from "@/server/telegram/groups";

const idParam = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ accountId: z.string().uuid() });

/** Resolves the group's t.me link to a chat id using a connected account, and stores it. */
export const POST = route<{ id: string }>(async ({ params, body }) => {
  const { id } = idParam.parse(params);
  const { accountId } = await body(bodySchema);
  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  if (!group) throw notFound();
  if (!group.url) throw new HttpError(400, "Group has no Telegram link");

  const { chatId, title } = await resolveGroup(accountId, group.url);
  if (chatId) await db.update(groups).set({ telegramChatId: chatId }).where(eq(groups.id, id));
  return { chatId, title };
});
