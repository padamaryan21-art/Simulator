/** Pure helpers for choosing and placing images. Unit-tested; no I/O. */

export type ImageStatus = "AVAILABLE" | "RESERVED" | "USED" | "DISABLED";

export function imageStatus(i: {
  enabled: boolean;
  usedAt: Date | null;
  reserved: boolean;
}): ImageStatus {
  if (!i.enabled) return "DISABLED";
  if (i.usedAt) return "USED";
  if (i.reserved) return "RESERVED";
  return "AVAILABLE";
}

export type Candidate = {
  id: string;
  topicId: string | null;
  personaId: string | null;
  enabled: boolean;
  usedAt: Date | null;
  reserved: boolean;
};

/**
 * Images a conversation may use: unused, not attached anywhere, enabled, belonging to THIS topic,
 * and sent by someone who actually takes part in the conversation.
 */
export function eligibleImages<T extends Candidate>(
  all: T[],
  topicId: string | null,
  participantIds: string[],
): T[] {
  if (!topicId) return [];
  const who = new Set(participantIds);
  return all.filter(
    (i) =>
      i.enabled &&
      !i.usedAt &&
      !i.reserved &&
      i.topicId === topicId &&
      i.personaId !== null &&
      who.has(i.personaId),
  );
}

/** Decides whether this conversation gets an image at all. */
export function shouldAddImage(
  settings: { enabled: boolean; chancePercent: number },
  rand = Math.random,
): boolean {
  return settings.enabled && settings.chancePercent > 0 && rand() * 100 < settings.chancePercent;
}

/**
 * Where an image message goes among `n` existing messages: never first, so the chat starts normally;
 * after the opening exchange when there is room; never past the end.
 */
export function imagePosition(n: number, rand = Math.random): number {
  if (n <= 2) return n;
  const earliest = Math.min(2, n);
  return earliest + Math.floor(rand() * (n - earliest + 1));
}

/** A sensible caption when the image has none. */
export const FALLBACK_CAPTION = "📷";
