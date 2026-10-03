import { Api } from "telegram";
import { connectAccount } from "./connection";
import { normalizeTelegramError } from "./errors";

/** Extracts the public username or invite hash from a t.me link or @handle. */
export function parseTelegramLink(input: string): { kind: "username" | "invite"; value: string } {
  const s = input.trim();
  const invite = /t\.me\/(?:\+|joinchat\/)([\w-]+)/i.exec(s);
  if (invite) return { kind: "invite", value: invite[1] };
  const user = /t\.me\/([\w]{4,})/i.exec(s) ?? /^@?([\w]{4,})$/.exec(s);
  if (user) return { kind: "username", value: user[1] };
  throw new Error("Unrecognised Telegram link");
}

/**
 * Resolve a group/channel to a stable chat id using one connected account.
 * Read-only: does not join the chat.
 */
export async function resolveGroup(accountId: string, link: string) {
  const parsed = parseTelegramLink(link);
  try {
    const client = await connectAccount(accountId);
    if (parsed.kind === "invite") {
      const res = await client.invoke(new Api.messages.CheckChatInvite({ hash: parsed.value }));
      if (res instanceof Api.ChatInviteAlready) {
        return { chatId: String(res.chat.id), title: "title" in res.chat ? res.chat.title : null };
      }
      return { chatId: null, title: "title" in res ? res.title : null };
    }
    const entity = await client.getEntity(parsed.value);
    return {
      chatId: String(entity.id),
      title: "title" in entity ? (entity.title as string) : null,
    };
  } catch (err) {
    throw normalizeTelegramError(err);
  }
}

/** Read recent messages the account is permitted to see (for context building). */
export async function readRecentMessages(accountId: string, chat: string, limit = 20) {
  try {
    const client = await connectAccount(accountId);
    const msgs = await client.getMessages(chat, { limit });
    return msgs.map((m) => ({
      id: m.id,
      text: m.message,
      date: m.date,
      senderId: m.senderId?.toString(),
    }));
  } catch (err) {
    throw normalizeTelegramError(err);
  }
}
