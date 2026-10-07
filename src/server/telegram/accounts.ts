import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramAccounts } from "@/db/schema";
import type { CreateAccountInput, UpdateAccountInput } from "@/validators/telegram";

/** Browser-safe shape. Never includes the encrypted session. */
export type PublicTelegramAccount = Omit<
  typeof telegramAccounts.$inferSelect,
  "encryptedSession"
> & {
  hasSession: boolean;
};

export function toPublicAccount(row: typeof telegramAccounts.$inferSelect): PublicTelegramAccount {
  const { encryptedSession, ...rest } = row;
  return { ...rest, hasSession: Boolean(encryptedSession) };
}

export async function listAccounts() {
  const rows = await db.select().from(telegramAccounts).orderBy(asc(telegramAccounts.createdAt));
  return rows.map(toPublicAccount);
}

export async function getAccountRow(id: string) {
  const [row] = await db.select().from(telegramAccounts).where(eq(telegramAccounts.id, id));
  return row ?? null;
}

export async function createAccount(input: CreateAccountInput) {
  const [row] = await db
    .insert(telegramAccounts)
    .values({
      displayName: input.displayName,
      username: input.username.replace(/^@/, ""),
      phone: input.phone || null,
      proxyUrl: input.proxyUrl ?? null,
    })
    .returning();
  return toPublicAccount(row);
}

export async function updateAccount(id: string, input: UpdateAccountInput) {
  if (!Object.keys(input).length) {
    const current = await getAccountRow(id);
    return current ? toPublicAccount(current) : null;
  }
  const [row] = await db
    .update(telegramAccounts)
    .set({
      ...input,
      ...(input.username ? { username: input.username.replace(/^@/, "") } : {}),
    })
    .where(eq(telegramAccounts.id, id))
    .returning();
  return row ? toPublicAccount(row) : null;
}

export async function deleteAccount(id: string) {
  await db.delete(telegramAccounts).where(eq(telegramAccounts.id, id));
}
