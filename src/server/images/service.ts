import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMessages, conversationSessions, images, personas, topics } from "@/db/schema";
import { childLogger } from "@/lib/logger";
import { textRiskCodes } from "@/server/claude/validators";
import { writeLog } from "@/server/conversations/logs";
import { getSetting } from "@/server/settings/settings";
import type { ImageListFilter } from "@/validators/images";
import {
  FALLBACK_CAPTION,
  eligibleImages,
  imagePosition,
  imageStatus,
  shouldAddImage,
  type ImageStatus,
} from "./pick";
import { ImageError, processImage } from "./process";
import { getImageBytes, putImage, removeImages } from "./storage";

export { ImageError };

const log = childLogger("images");

const MAX_FILES_PER_UPLOAD = 20;
const MAX_LIBRARY = 1000;

const RISK_TEXT: Record<string, string> = {
  link: "a link",
  promo_language: "promotional wording",
  win_claim: "a winning claim",
  unverified_number: "an unverified figure",
};

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

/** Captions go through the same risk checks as conversation lines. */
function assertCaptionOk(caption: string) {
  const codes = textRiskCodes(caption);
  if (codes.length) {
    throw new ImageError(
      `The caption contains ${codes.map((c) => RISK_TEXT[c] ?? c).join(", ")}. Captions must be plain everyday text.`,
    );
  }
}

export type LibraryImage = {
  id: string;
  filename: string;
  caption: string;
  kind: (typeof images.$inferSelect)["kind"];
  width: number;
  height: number;
  bytes: number;
  enabled: boolean;
  usedAt: Date | null;
  createdAt: Date;
  topicId: string | null;
  topicTitle: string | null;
  personaId: string | null;
  personaName: string | null;
  status: ImageStatus;
};

/** Library with each image's live status: available, reserved by a draft, used (posted) or disabled. */
export async function listImages(filter: ImageListFilter = {}): Promise<LibraryImage[]> {
  const rows = await db
    .select({
      image: images,
      topicTitle: topics.title,
      personaName: personas.name,
      refs: sql<number>`(select count(*) from conversation_messages m where m.image_id = ${images.id})`.mapWith(
        Number,
      ),
    })
    .from(images)
    .leftJoin(topics, eq(images.topicId, topics.id))
    .leftJoin(personas, eq(images.personaId, personas.id))
    .where(
      and(
        filter.topicId ? eq(images.topicId, filter.topicId) : undefined,
        filter.personaId ? eq(images.personaId, filter.personaId) : undefined,
      ),
    )
    .orderBy(desc(images.createdAt));

  const mapped = rows.map((r) => ({
    id: r.image.id,
    filename: r.image.filename,
    caption: r.image.caption,
    kind: r.image.kind,
    width: r.image.width,
    height: r.image.height,
    bytes: r.image.bytes,
    enabled: r.image.enabled,
    usedAt: r.image.usedAt,
    createdAt: r.image.createdAt,
    topicId: r.image.topicId,
    topicTitle: r.topicTitle,
    personaId: r.image.personaId,
    personaName: r.personaName,
    status: imageStatus({ enabled: r.image.enabled, usedAt: r.image.usedAt, reserved: r.refs > 0 }),
  }));
  return filter.status ? mapped.filter((m) => m.status === filter.status) : mapped;
}

export async function getImage(id: string) {
  const [row] = await db.select().from(images).where(eq(images.id, id));
  return row ?? null;
}

export type UploadResult = { filename: string; ok: boolean; id?: string; error?: string };

export async function uploadImages(
  files: { name: string; data: Buffer }[],
  defaults: {
    topicId?: string | null;
    personaId?: string | null;
    kind: (typeof images.$inferSelect)["kind"];
    caption: string;
  },
  userId: string,
): Promise<UploadResult[]> {
  if (!files.length) throw new ImageError("Choose at least one picture.");
  if (files.length > MAX_FILES_PER_UPLOAD)
    throw new ImageError(`Upload at most ${MAX_FILES_PER_UPLOAD} pictures at a time.`);
  assertCaptionOk(defaults.caption);

  if (defaults.topicId) {
    const [t] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.id, defaults.topicId));
    if (!t) throw new ImageError("That topic does not exist.");
  }
  if (defaults.personaId) {
    const [p] = await db
      .select({ id: personas.id })
      .from(personas)
      .where(eq(personas.id, defaults.personaId));
    if (!p) throw new ImageError("That persona does not exist.");
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(images);
  if (n + files.length > MAX_LIBRARY)
    throw new ImageError(`The library is limited to ${MAX_LIBRARY} pictures.`);

  const results: UploadResult[] = [];
  for (const f of files) {
    const filename = f.name.slice(0, 200) || "image";
    try {
      const p = await processImage(f.data);
      const [dup] = await db
        .select({ id: images.id })
        .from(images)
        .where(eq(images.sha256, p.sha256));
      if (dup) {
        results.push({ filename, ok: false, error: "This picture is already in the library." });
        continue;
      }
      const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.jpg`;
      await putImage(path, p.data);
      try {
        const [row] = await db
          .insert(images)
          .values({
            filename,
            storagePath: path,
            bytes: p.data.byteLength,
            width: p.width,
            height: p.height,
            sha256: p.sha256,
            caption: defaults.caption,
            kind: defaults.kind,
            topicId: defaults.topicId ?? null,
            personaId: defaults.personaId ?? null,
          })
          .returning({ id: images.id });
        results.push({ filename, ok: true, id: row.id });
      } catch (err) {
        await removeImages([path]); // do not leave an orphan file behind
        if (isUniqueViolation(err))
          results.push({ filename, ok: false, error: "This picture is already in the library." });
        else throw err;
      }
    } catch (err) {
      results.push({
        filename,
        ok: false,
        error: err instanceof ImageError ? err.message : "Upload failed.",
      });
      if (!(err instanceof ImageError))
        log.warn({ filename, err: (err as Error).message }, "image upload failed");
    }
  }
  await writeLog("info", "images", "Images uploaded", {
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    actorId: userId,
  });
  return results;
}

async function referenceCount(imageId: string) {
  const rows = await db
    .select({
      id: conversationMessages.id,
      status: conversationMessages.status,
      sessionId: conversationMessages.sessionId,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.imageId, imageId));
  return rows;
}

export async function updateImage(
  id: string,
  patch: {
    caption?: string;
    kind?: (typeof images.$inferSelect)["kind"];
    topicId?: string | null;
    personaId?: string | null;
    enabled?: boolean;
  },
) {
  const current = await getImage(id);
  if (!current) throw new ImageError("Image not found.");
  if (patch.caption !== undefined) assertCaptionOk(patch.caption);
  if (
    (patch.topicId !== undefined || patch.personaId !== undefined) &&
    (await referenceCount(id)).length
  ) {
    throw new ImageError(
      "This image is already attached to a conversation, so its topic and sender can no longer be changed.",
    );
  }
  if (!Object.keys(patch).length) return current;
  const [row] = await db.update(images).set(patch).where(eq(images.id, id)).returning();
  return row;
}

export async function deleteImage(id: string) {
  const current = await getImage(id);
  if (!current) throw new ImageError("Image not found.");
  const refs = await referenceCount(id);
  if (refs.some((r) => r.status !== "SENT")) {
    throw new ImageError(
      "This image is attached to a draft conversation. Remove it there first, or delete that draft.",
    );
  }
  await db.delete(images).where(eq(images.id, id)); // sent messages keep their text; the link is cleared
  await removeImages([current.storagePath]);
}

/** Makes an image available again, but only if it was never really posted. */
export async function resetImage(id: string) {
  const current = await getImage(id);
  if (!current) throw new ImageError("Image not found.");
  const refs = await referenceCount(id);
  if (current.usedAt || refs.some((r) => r.status === "SENT")) {
    throw new ImageError(
      "This picture was already posted to a group, so it can never be used again.",
    );
  }
  const ids = refs.map((r) => r.id);
  if (ids.length) {
    // The unsent messages that carried it are cancelled so they cannot post a bare caption.
    await db
      .update(conversationMessages)
      .set({
        imageId: null,
        status: "CANCELLED",
        errorMessage: "Image was released",
        approvedAt: null,
        approvedBy: null,
      })
      .where(inArray(conversationMessages.id, ids));
  }
  return current;
}

async function editableMessage(messageId: string) {
  const [m] = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, messageId));
  if (!m) throw new ImageError("Message not found.");
  const [s] = await db
    .select()
    .from(conversationSessions)
    .where(eq(conversationSessions.id, m.sessionId));
  if (!["DRAFT", "PENDING_APPROVAL"].includes(s.status) || m.status === "SENT") {
    throw new ImageError("This conversation can no longer be edited.");
  }
  return m;
}

/** Attaches an unused image to a message. Editing a message revokes its approval. */
export async function attachImage(messageId: string, imageId: string) {
  const m = await editableMessage(messageId);
  const img = await getImage(imageId);
  if (!img) throw new ImageError("Image not found.");
  if (!img.enabled) throw new ImageError("This image is disabled.");
  if (img.usedAt) throw new ImageError("This picture was already posted and cannot be used again.");
  if (img.personaId && img.personaId !== m.personaId) {
    const [p] = await db
      .select({ name: personas.name })
      .from(personas)
      .where(eq(personas.id, img.personaId));
    throw new ImageError(
      `This image belongs to ${p?.name ?? "another persona"}. Attach it to one of their messages.`,
    );
  }
  try {
    const [row] = await db
      .update(conversationMessages)
      .set({ imageId, status: "EDITED", approvedAt: null, approvedBy: null })
      .where(eq(conversationMessages.id, messageId))
      .returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ImageError("That image is already attached to another message.");
    throw err;
  }
}

/** Removes the image from a message. A message that was only the picture is removed entirely. */
export async function detachImage(messageId: string) {
  const m = await editableMessage(messageId);
  if (!m.imageId) return m;
  if (m.content.trim() === FALLBACK_CAPTION || !m.content.trim()) {
    await db.delete(conversationMessages).where(eq(conversationMessages.id, messageId));
    return null;
  }
  const [row] = await db
    .update(conversationMessages)
    .set({ imageId: null, status: "EDITED", approvedAt: null, approvedBy: null })
    .where(eq(conversationMessages.id, messageId))
    .returning();
  return row;
}

/**
 * Called right after a conversation is generated. If its topic has an unused image whose sender
 * takes part, and the chance roll succeeds, the image is added as a message from that persona.
 * The unique index on messages.image_id makes a double pick impossible even when many
 * conversations are generated at once; on a clash another candidate is tried.
 */
export async function maybeAddImageMessage(input: {
  sessionId: string;
  topicId: string | null;
  participantIds: string[];
  automatic: boolean;
}): Promise<string | null> {
  const settings = await getSetting("images");
  if (!shouldAddImage(settings) || !input.topicId) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const all = await listImages({ topicId: input.topicId });
    const pool = eligibleImages(
      all.map((i) => ({ ...i, reserved: i.status === "RESERVED" })),
      input.topicId,
      input.participantIds,
    );
    if (!pool.length) return null;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    try {
      return await db.transaction(async (tx) => {
        const msgs = await tx
          .select({ id: conversationMessages.id })
          .from(conversationMessages)
          .where(eq(conversationMessages.sessionId, input.sessionId));
        const position = imagePosition(msgs.length);
        const [persona] = await tx
          .select({ accountId: personas.telegramAccountId, active: personas.active })
          .from(personas)
          .where(eq(personas.id, pick.personaId!));
        if (!persona?.active) return null;

        await tx.execute(
          sql`update conversation_messages set position = position + 1 where session_id = ${input.sessionId} and position >= ${position}`,
        );
        const [row] = await tx
          .insert(conversationMessages)
          .values({
            sessionId: input.sessionId,
            personaId: pick.personaId,
            telegramAccountId: persona.accountId,
            position,
            content: pick.caption.trim() || FALLBACK_CAPTION,
            status: input.automatic ? "APPROVED" : "GENERATED",
            approvedAt: input.automatic ? new Date() : null,
            imageId: pick.id,
          })
          .returning({ id: conversationMessages.id });
        return row.id;
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // another conversation took this image a moment ago: choose again
    }
  }
  return null;
}

/** Permanently marks an image as posted. After this it can never be picked or attached again. */
export async function markImageUsed(imageId: string) {
  await db
    .update(images)
    .set({ usedAt: new Date() })
    .where(and(eq(images.id, imageId), isNull(images.usedAt)));
}

/** The picture's bytes for sending, or null when the message has no (usable) image. */
export async function loadImageForSend(imageId: string) {
  const img = await getImage(imageId);
  if (!img) return null;
  return { image: img, data: await getImageBytes(img.storagePath) };
}
