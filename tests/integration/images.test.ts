import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupAll, makeGroup, PREFIX } from "./fixtures";

let imagesBefore: { enabled: boolean; chancePercent: number };

beforeAll(async () => {
  await cleanupAll();
  const { getSetting, setSetting } = await import("@/server/settings/settings");
  imagesBefore = await getSetting("images");
  await setSetting("images", { enabled: true, chancePercent: 100 }); // always roll an image in these tests
});
afterAll(async () => {
  const { setSetting } = await import("@/server/settings/settings");
  await setSetting("images", imagesBefore); // put the user's real setting back
  await cleanupAll();
});

const jpeg = (color: string, withGps = false) => {
  let s = sharp({ create: { width: 640, height: 480, channels: 3, background: color } });
  if (withGps)
    s = s.withExif({
      IFD0: { Copyright: "SECRET-OWNER" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "14/1 35/1 0/1" },
    });
  return s.jpeg().toBuffer();
};
let colorSeed = 0;
const uniqueJpeg = () =>
  jpeg(`#${((0x101010 + colorSeed++ * 0x0a0b0c) & 0xffffff).toString(16).padStart(6, "0")}`);

async function world() {
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const [topic] = await db
    .insert(s.topics)
    .values({
      categoryId: (await db.select().from(s.topicCategories).limit(1))[0].id,
      title: `${PREFIX}topic-${Math.random().toString(36).slice(2, 6)}`,
    })
    .returning();
  const [a] = await db
    .insert(s.personas)
    .values({ name: `${PREFIX}A-${Math.random().toString(36).slice(2, 5)}` })
    .returning();
  const [b] = await db
    .insert(s.personas)
    .values({ name: `${PREFIX}B-${Math.random().toString(36).slice(2, 5)}` })
    .returning();
  const group = await makeGroup({ name: `img-${Math.random().toString(36).slice(2, 6)}` });
  return { db, s, topic, a, b, group };
}

async function upload(
  name: string,
  topicId: string | null,
  personaId: string | null,
  caption = "",
) {
  const { uploadImages } = await import("@/server/images/service");
  const [r] = await uploadImages(
    [{ name: `${PREFIX}${name}.jpg`, data: await uniqueJpeg() }],
    { topicId, personaId, kind: "PHOTO", caption },
    "00000000-0000-0000-0000-000000000001",
  );
  if (!r.ok) throw new Error(r.error);
  return r.id!;
}

async function session(
  w: Awaited<ReturnType<typeof world>>,
  n = 6,
  mode: "PREVIEW" | "MANUAL" = "PREVIEW",
) {
  const [sess] = await w.db
    .insert(w.s.conversationSessions)
    .values({
      groupId: w.group.id,
      topicId: w.topic.id,
      mode,
      status: mode === "PREVIEW" ? "DRAFT" : "PENDING_APPROVAL",
      environment: "PRIVATE_SIMULATION",
    })
    .returning();
  await w.db.insert(w.s.conversationMessages).values(
    Array.from({ length: n }, (_, i) => ({
      sessionId: sess.id,
      personaId: i % 2 ? w.b.id : w.a.id,
      position: i,
      content: `m${i}`,
      status: "GENERATED" as const,
    })),
  );
  return sess;
}

const messagesOf = async (w: Awaited<ReturnType<typeof world>>, sessionId: string) => {
  const { eq, asc } = await import("drizzle-orm");
  return w.db
    .select()
    .from(w.s.conversationMessages)
    .where(eq(w.s.conversationMessages.sessionId, sessionId))
    .orderBy(asc(w.s.conversationMessages.position));
};

describe("uploading to the library", () => {
  it("stores a cleaned copy, shows it as available, and refuses duplicates, bad captions and fake files", async () => {
    const { uploadImages, listImages } = await import("@/server/images/service");
    const { getImageBytes } = await import("@/server/images/storage");
    const { db, s } = await world();

    const original = await jpeg("#cc3366", true);
    const [ok] = await uploadImages(
      [{ name: `${PREFIX}gps.jpg`, data: original }],
      { kind: "PHOTO", caption: "ulam namin" },
      "u",
    );
    expect(ok.ok).toBe(true);

    const [row] = await db
      .select()
      .from(s.images)
      .where((await import("drizzle-orm")).eq(s.images.id, ok.id!));
    const stored = await getImageBytes(row.storagePath);
    expect((await sharp(stored).metadata()).exif).toBeUndefined(); // location data is gone
    expect(stored.includes(Buffer.from("SECRET-OWNER"))).toBe(false);
    expect((await listImages()).find((i) => i.id === ok.id)!.status).toBe("AVAILABLE");

    const [dup] = await uploadImages(
      [{ name: `${PREFIX}gps-again.jpg`, data: original }],
      { kind: "PHOTO", caption: "" },
      "u",
    );
    expect(dup).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already in the library/),
    });

    await expect(
      uploadImages(
        [{ name: `${PREFIX}x.jpg`, data: await uniqueJpeg() }],
        { kind: "PHOTO", caption: "Nanalo ako ng 50,000 sigurado panalo" },
        "u",
      ),
    ).rejects.toThrow(/caption/i);
    const [fake] = await uploadImages(
      [{ name: `${PREFIX}fake.jpg`, data: Buffer.from("not a picture") }],
      { kind: "PHOTO", caption: "" },
      "u",
    );
    expect(fake.ok).toBe(false);
  });
});

describe("a picture is used once, for its own topic and sender", () => {
  it("adds an image from an eligible persona after the opening, then never offers it again", async () => {
    const { maybeAddImageMessage, listImages } = await import("@/server/images/service");
    const w = await world();
    const i1 = await upload("one", w.topic.id, w.a.id, "ayan oh");
    const i2 = await upload("two", w.topic.id, w.b.id);

    const s1 = await session(w);
    const m1 = await maybeAddImageMessage({
      sessionId: s1.id,
      topicId: w.topic.id,
      participantIds: [w.a.id, w.b.id],
      automatic: false,
    });
    expect(m1).not.toBeNull();
    const msgs1 = await messagesOf(w, s1.id);
    expect(msgs1).toHaveLength(7);
    expect(msgs1.map((m) => m.position)).toEqual([0, 1, 2, 3, 4, 5, 6]); // positions stay contiguous
    const imgMsg = msgs1.find((m) => m.imageId)!;
    expect(imgMsg.position).toBeGreaterThanOrEqual(2);
    expect([i1, i2]).toContain(imgMsg.imageId);
    expect(imgMsg.personaId).toBe(imgMsg.imageId === i1 ? w.a.id : w.b.id); // sent by the assigned persona
    expect(imgMsg.status).toBe("GENERATED");
    expect(imgMsg.content).toBe(imgMsg.imageId === i1 ? "ayan oh" : "📷");

    const s2 = await session(w);
    await maybeAddImageMessage({
      sessionId: s2.id,
      topicId: w.topic.id,
      participantIds: [w.a.id, w.b.id],
      automatic: true,
    });
    const img2 = (await messagesOf(w, s2.id)).find((m) => m.imageId)!;
    expect(img2.imageId).not.toBe(imgMsg.imageId); // the other one
    expect(img2.status).toBe("APPROVED"); // automatic conversations are pre-approved

    const s3 = await session(w);
    expect(
      await maybeAddImageMessage({
        sessionId: s3.id,
        topicId: w.topic.id,
        participantIds: [w.a.id, w.b.id],
        automatic: false,
      }),
    ).toBeNull(); // none left
    expect((await listImages({ topicId: w.topic.id })).every((i) => i.status === "RESERVED")).toBe(
      true,
    );
  });

  it("respects the topic, the participants and the disabled switch", async () => {
    const { maybeAddImageMessage, updateImage } = await import("@/server/images/service");
    const w = await world();
    const otherTopic = (
      await w.db
        .insert(w.s.topics)
        .values({ categoryId: w.topic.categoryId, title: `${PREFIX}other` })
        .returning()
    )[0];
    await upload("wrong-topic", otherTopic.id, w.a.id);
    const off = await upload("disabled", w.topic.id, w.a.id);
    await updateImage(off, { enabled: false });
    const onlyB = await upload("b-only", w.topic.id, w.b.id);

    const s = await session(w);
    // A is the only participant: B's image, the disabled one and the other topic's one are all ineligible.
    expect(
      await maybeAddImageMessage({
        sessionId: s.id,
        topicId: w.topic.id,
        participantIds: [w.a.id],
        automatic: false,
      }),
    ).toBeNull();
    // With B present, exactly B's image qualifies.
    await maybeAddImageMessage({
      sessionId: s.id,
      topicId: w.topic.id,
      participantIds: [w.a.id, w.b.id],
      automatic: false,
    });
    expect((await messagesOf(w, s.id)).find((m) => m.imageId)!.imageId).toBe(onlyB);
    // No topic, no image.
    expect(
      await maybeAddImageMessage({
        sessionId: s.id,
        topicId: null,
        participantIds: [w.a.id, w.b.id],
        automatic: false,
      }),
    ).toBeNull();
  });

  it("never gives the same image to two conversations generated at the same moment", async () => {
    const { maybeAddImageMessage } = await import("@/server/images/service");
    const w = await world();
    await upload("only-one", w.topic.id, w.a.id);
    const sessions = await Promise.all([session(w), session(w), session(w), session(w)]);
    const results = await Promise.all(
      sessions.map((s) =>
        maybeAddImageMessage({
          sessionId: s.id,
          topicId: w.topic.id,
          participantIds: [w.a.id, w.b.id],
          automatic: false,
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1); // the database's unique index lets exactly one win
    const withImage = (await Promise.all(sessions.map((s) => messagesOf(w, s.id))))
      .flat()
      .filter((m) => m.imageId);
    expect(withImage).toHaveLength(1);
  });
});

describe("attaching by hand, removing, deleting, releasing", () => {
  it("attach checks the sender, revokes approval, and refuses an image that is already taken", async () => {
    const { attachImage, detachImage } = await import("@/server/images/service");
    const w = await world();
    const img = await upload("manual", w.topic.id, w.a.id);
    const s = await session(w, 4, "MANUAL");
    const msgs = await messagesOf(w, s.id);
    const byA = msgs.find((m) => m.personaId === w.a.id)!;
    const byB = msgs.find((m) => m.personaId === w.b.id)!;

    await expect(attachImage(byB.id, img)).rejects.toThrow(/belongs to/); // wrong persona

    await w.db
      .update(w.s.conversationMessages)
      .set({
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: "00000000-0000-0000-0000-000000000001",
      })
      .where((await import("drizzle-orm")).eq(w.s.conversationMessages.id, byA.id));
    const after = await attachImage(byA.id, img);
    expect(after.imageId).toBe(img);
    expect([after.status, after.approvedAt, after.approvedBy]).toEqual(["EDITED", null, null]); // must be re-approved

    const other = (await messagesOf(w, s.id)).find(
      (m) => m.personaId === w.a.id && m.id !== byA.id,
    )!;
    await expect(attachImage(other.id, img)).rejects.toThrow(/already attached/);

    await detachImage(byA.id);
    expect((await messagesOf(w, s.id)).find((m) => m.id === byA.id)!.imageId).toBeNull();
  });

  it("an image can be deleted only when no draft holds it; the stored file goes with it", async () => {
    const { maybeAddImageMessage, deleteImage, getImage, detachImage } =
      await import("@/server/images/service");
    const { getImageBytes } = await import("@/server/images/storage");
    const w = await world();
    const img = await upload("deleteme", w.topic.id, w.a.id);
    const s = await session(w);
    await maybeAddImageMessage({
      sessionId: s.id,
      topicId: w.topic.id,
      participantIds: [w.a.id, w.b.id],
      automatic: false,
    });
    await expect(deleteImage(img)).rejects.toThrow(/attached to a draft/);

    const imgMsg = (await messagesOf(w, s.id)).find((m) => m.imageId)!;
    await detachImage(imgMsg.id); // a picture-only message is removed entirely
    expect((await messagesOf(w, s.id)).some((m) => m.id === imgMsg.id)).toBe(false);

    const path = (await getImage(img))!.storagePath;
    await deleteImage(img);
    expect(await getImage(img)).toBeNull();
    await expect(getImageBytes(path)).rejects.toThrow();
  });

  it("releasing frees an unposted image but never one that was really posted", async () => {
    const { maybeAddImageMessage, resetImage, listImages, markImageUsed } =
      await import("@/server/images/service");
    const w = await world();
    const img = await upload("release", w.topic.id, w.a.id);
    const s = await session(w);
    await maybeAddImageMessage({
      sessionId: s.id,
      topicId: w.topic.id,
      participantIds: [w.a.id, w.b.id],
      automatic: false,
    });
    const held = (await messagesOf(w, s.id)).find((m) => m.imageId)!;

    await resetImage(img);
    const freed = (await messagesOf(w, s.id)).find((m) => m.id === held.id)!;
    expect([freed.imageId, freed.status]).toEqual([null, "CANCELLED"]); // cannot post a bare caption
    expect((await listImages()).find((i) => i.id === img)!.status).toBe("AVAILABLE");

    await markImageUsed(img);
    await expect(resetImage(img)).rejects.toThrow(/already posted/);
  });

  it("once posted, an image can never come back, even if its conversation is deleted from History", async () => {
    const { maybeAddImageMessage, markImageUsed, listImages, attachImage } =
      await import("@/server/images/service");
    const { deleteSessions } = await import("@/server/conversations/history");
    const w = await world();
    const img = await upload("posted", w.topic.id, w.a.id);
    const s = await session(w);
    await maybeAddImageMessage({
      sessionId: s.id,
      topicId: w.topic.id,
      participantIds: [w.a.id, w.b.id],
      automatic: false,
    });
    await markImageUsed(img);
    expect((await listImages()).find((i) => i.id === img)!.status).toBe("USED");

    await deleteSessions([s.id]); // the history is wiped...
    expect((await listImages()).find((i) => i.id === img)!.status).toBe("USED"); // ...the image stays retired

    const s2 = await session(w);
    expect(
      await maybeAddImageMessage({
        sessionId: s2.id,
        topicId: w.topic.id,
        participantIds: [w.a.id, w.b.id],
        automatic: false,
      }),
    ).toBeNull();
    const m = (await messagesOf(w, s2.id))[0];
    await expect(attachImage(m.id, img)).rejects.toThrow(/already posted/);
  });
});

describe("sending", () => {
  it("a dry-run send posts the picture message but does not use up the library image", async () => {
    process.env.SIMULATION_DRY_RUN = "true";
    const { maybeAddImageMessage, listImages } = await import("@/server/images/service");
    const { runSender } = await import("@/server/conversations/sender");
    const w = await world();
    const img = await upload("dry", w.topic.id, w.a.id);
    const [sess] = await w.db
      .insert(w.s.conversationSessions)
      .values({
        groupId: w.group.id,
        topicId: w.topic.id,
        mode: "MANUAL",
        status: "SENDING",
        environment: "PRIVATE_SIMULATION",
      })
      .returning();
    await w.db.insert(w.s.conversationMessages).values([
      {
        sessionId: sess.id,
        personaId: w.a.id,
        position: 0,
        content: "hi",
        status: "APPROVED" as const,
        approvedAt: new Date(),
        approvedBy: "00000000-0000-0000-0000-000000000001",
      },
      {
        sessionId: sess.id,
        personaId: w.b.id,
        position: 1,
        content: "hello",
        status: "APPROVED" as const,
        approvedAt: new Date(),
        approvedBy: "00000000-0000-0000-0000-000000000001",
      },
    ]);
    // add the image message, approve it as a person would, then run the sender
    await maybeAddImageMessage({
      sessionId: sess.id,
      topicId: w.topic.id,
      participantIds: [w.a.id, w.b.id],
      automatic: false,
    });
    const { eq } = await import("drizzle-orm");
    await w.db
      .update(w.s.conversationMessages)
      .set({
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: "00000000-0000-0000-0000-000000000001",
      })
      .where(eq(w.s.conversationMessages.sessionId, sess.id));
    // No waiting between messages in this test; the user's real delay setting is restored afterwards.
    const { setSetting } = await import("@/server/settings/settings");
    const savedRow = (
      await w.db.select().from(w.s.appSettings).where(eq(w.s.appSettings.key, "sending"))
    )[0];
    await setSetting("sending", { minDelaySec: 0, maxDelaySec: 0 });
    try {
      await runSender(sess.id, "00000000-0000-0000-0000-000000000001");
    } finally {
      if (savedRow) {
        await w.db
          .update(w.s.appSettings)
          .set({ value: savedRow.value })
          .where(eq(w.s.appSettings.key, "sending"));
      } else {
        await w.db.delete(w.s.appSettings).where(eq(w.s.appSettings.key, "sending"));
      }
    }
    const sent = await messagesOf(w, sess.id);
    expect(sent.every((m) => m.status === "SENT")).toBe(true);
    expect(sent.some((m) => m.imageId === img)).toBe(true);
    const row = (await listImages()).find((i) => i.id === img)!;
    expect(row.usedAt).toBeNull(); // a rehearsal must not burn the real library
  });
});
