import bigInt from "big-integer";
import { Api, type TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { isDryRun } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import { connectAccount } from "./connection";
import { TelegramServiceError, normalizeTelegramError } from "./errors";
import { parseTelegramLink } from "./groups";

const log = childLogger("telegram.messages");

export type ChatTarget = { url: string | null; telegramChatId: string | null };

/** Per-account cache of resolved chat entities (access hashes are account-specific). */
const g = globalThis as unknown as { __tgEntities?: Map<string, unknown> };
const entities = (g.__tgEntities ??= new Map());

async function resolveChat(accountId: string, client: TelegramClient, target: ChatTarget) {
  const cacheKey = `${accountId}:${target.telegramChatId ?? target.url}`;
  const cached = entities.get(cacheKey);
  if (cached) return cached as Api.TypeChat;

  let entity: Api.TypeChat | undefined;
  const link = target.url ? safeParse(target.url) : null;
  if (link?.kind === "username") {
    entity = (await client.getEntity(link.value)) as Api.TypeChat;
  } else if (target.telegramChatId) {
    // Loading dialogs fills the entity cache with access hashes for chats this account is in.
    await client.getDialogs({ limit: 300 });
    const id = bigInt(target.telegramChatId);
    for (const peer of [new Api.PeerChannel({ channelId: id }), new Api.PeerChat({ chatId: id })]) {
      try {
        entity = (await client.getEntity(peer)) as Api.TypeChat;
        break;
      } catch {
        /* try next peer type */
      }
    }
  }
  if (!entity) {
    throw new TelegramServiceError(
      "This account cannot find the group. Make sure it has joined the group, then resolve the link again.",
      "NOT_AUTHORIZED",
    );
  }
  entities.set(cacheKey, entity);
  return entity;
}

function safeParse(url: string) {
  try {
    return parseTelegramLink(url);
  } catch {
    return null;
  }
}

/**
 * Sends one message as a connected account. This is the ONLY function that posts to Telegram;
 * callers (the conversation sender) are responsible for enforcing approval rules first.
 *
 * FloodWait is surfaced to the caller (code FLOOD_WAIT + retryAfterSeconds) so it can wait
 * the required time instead of retrying in a tight loop.
 */
export async function sendMessage(accountId: string, target: ChatTarget, text: string) {
  if (isDryRun()) {
    log.info({ accountId }, "DRY RUN: message not sent to Telegram");
    return { telegramMessageId: 0 };
  }
  try {
    const client = await connectAccount(accountId);
    const entity = await resolveChat(accountId, client, target);
    const sent = await client.sendMessage(entity, { message: text });
    log.info({ accountId, messageId: sent.id }, "message sent");
    return { telegramMessageId: sent.id };
  } catch (err) {
    const e = err instanceof TelegramServiceError ? err : normalizeTelegramError(err);
    log.warn({ accountId, code: e.code, retryAfter: e.retryAfterSeconds }, "send failed");
    throw e;
  }
}

/**
 * Sends one picture (with an optional caption) as a photo. Same rules as sendMessage: the caller
 * must already have enforced approval; FloodWait is surfaced to the caller.
 */
export async function sendImage(
  accountId: string,
  target: ChatTarget,
  image: { data: Buffer; filename: string; caption: string },
) {
  if (isDryRun()) {
    log.info({ accountId }, "DRY RUN: picture not sent to Telegram");
    return { telegramMessageId: 0 };
  }
  try {
    const client = await connectAccount(accountId);
    const entity = await resolveChat(accountId, client, target);
    const file = new CustomFile(image.filename, image.data.byteLength, "", image.data);
    const sent = await client.sendFile(entity, {
      file,
      caption: image.caption,
      forceDocument: false,
    });
    log.info({ accountId, messageId: sent.id }, "picture sent");
    return { telegramMessageId: sent.id };
  } catch (err) {
    const e = err instanceof TelegramServiceError ? err : normalizeTelegramError(err);
    log.warn({ accountId, code: e.code, retryAfter: e.retryAfterSeconds }, "picture send failed");
    throw e;
  }
}
