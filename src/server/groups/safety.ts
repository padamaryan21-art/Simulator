import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { groups } from "@/db/schema";
import { sameTelegramTarget } from "@/lib/telegram-links";

type GroupTarget = {
  id: string;
  name: string;
  type: string;
  url: string | null;
  telegramChatId: string | null;
};

/**
 * Returns the real-community group that a NON-real group points at (same link or same chat id), or
 * null. A private simulation group must never share a chat with the real community: automation
 * would then post simulated conversations there.
 */
export async function realCommunityConflict(group: GroupTarget) {
  if (group.type === "REAL_COMMUNITY") return null;
  const reals = await db
    .select()
    .from(groups)
    .where(and(eq(groups.type, "REAL_COMMUNITY"), ne(groups.id, group.id)));
  return reals.find((r) => sameTelegramTarget(group, r)) ?? null;
}
