/**
 * Comparing Telegram targets. Used to make sure a private simulation group is never pointed at the
 * same chat as the real LakiPH Community. Pure, so it is unit-tested.
 */

/** "https://t.me/+AbC/", "t.me/joinchat/AbC?x=1" and "https://www.t.me/+abc" all become "t.me/+abc". */
export function normalizeTelegramLink(url: string | null | undefined): string | null {
  if (!url) return null;
  let s = url.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split(/[?#]/)[0].replace(/\/+$/, "");
  s = s.replace(/^t\.me\/joinchat\//, "t.me/+");
  return s || null;
}

type Target = { url?: string | null; telegramChatId?: string | null };

/** True when both point at the same Telegram chat, by resolved chat id or by link. */
export function sameTelegramTarget(a: Target, b: Target): boolean {
  if (a.telegramChatId && b.telegramChatId && String(a.telegramChatId) === String(b.telegramChatId))
    return true;
  const la = normalizeTelegramLink(a.url);
  return la !== null && la === normalizeTelegramLink(b.url);
}

export const REAL_COMMUNITY_TARGET_MESSAGE =
  "This points at the real LakiPH Community chat, which is human-approval only and can never be automated or used for simulated conversations. Use the link of your private test group instead.";
