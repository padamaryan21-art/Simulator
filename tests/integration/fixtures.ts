import { eq, inArray, like } from "drizzle-orm";

export const PREFIX = "ZZ-IT-";

/** Creates an isolated private group (plus, optionally, all real personas as participants). */
export async function makeGroup(opts: {
  name: string;
  withParticipants?: boolean;
  type?: "PRIVATE_SIMULATION" | "REAL_COMMUNITY";
}) {
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const [g] = await db
    .insert(s.groups)
    .values({
      name: `${PREFIX}${opts.name}`,
      type: opts.type ?? "PRIVATE_SIMULATION",
      purpose: "integration test",
    })
    .returning();
  if (opts.withParticipants) {
    const personas = await db.select().from(s.personas);
    await db
      .insert(s.groupParticipants)
      .values(personas.map((p) => ({ groupId: g.id, personaId: p.id })));
  }
  return g;
}

/** Removes everything the integration tests created, in dependency order. */
export async function cleanupAll() {
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const groups = await db
    .select({ id: s.groups.id })
    .from(s.groups)
    .where(like(s.groups.name, `${PREFIX}%`));
  const gids = groups.map((g) => g.id);
  if (gids.length) {
    await db.delete(s.conversationSessions).where(inArray(s.conversationSessions.groupId, gids)); // messages cascade
    await db.delete(s.groups).where(inArray(s.groups.id, gids)); // schedules, runs, participants cascade
  }
  const personas = await db
    .select({ id: s.personas.id })
    .from(s.personas)
    .where(like(s.personas.name, `${PREFIX}%`));
  if (personas.length)
    await db.delete(s.personas).where(
      inArray(
        s.personas.id,
        personas.map((p) => p.id),
      ),
    );
  // Test images: remove the stored files first, then the rows.
  const imgs = await db
    .select({ id: s.images.id, path: s.images.storagePath })
    .from(s.images)
    .where(like(s.images.filename, `${PREFIX}%`));
  if (imgs.length) {
    const { removeImages } = await import("@/server/images/storage");
    await removeImages(imgs.map((i) => i.path));
    await db.delete(s.images).where(
      inArray(
        s.images.id,
        imgs.map((i) => i.id),
      ),
    );
  }
  const tps = await db
    .select({ id: s.topics.id })
    .from(s.topics)
    .where(like(s.topics.title, `${PREFIX}%`));
  if (tps.length)
    await db.delete(s.topics).where(
      inArray(
        s.topics.id,
        tps.map((t) => t.id),
      ),
    );
  await db.delete(s.appSettings).where(eq(s.appSettings.key, `${PREFIX}probe`));
}
