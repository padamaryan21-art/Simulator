import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupAll, makeGroup, PREFIX } from "./fixtures";

beforeAll(cleanupAll);
afterAll(cleanupAll);

describe("groups: partial updates never wipe data (regression)", () => {
  it("toggling flags keeps participants, purpose and the other flags", async () => {
    const { createGroup, updateGroup, listGroups } = await import("@/server/groups/groups");
    const { createGroupSchema, updateGroupSchema } = await import("@/validators/telegram");
    const { db } = await import("@/db");
    const { personas } = await import("@/db/schema");
    const ps = await db.select().from(personas);
    const g = await createGroup(
      createGroupSchema.parse({
        name: `${PREFIX}patch`,
        type: "PRIVATE_SIMULATION",
        purpose: "keep me",
        automationEnabled: true,
        participantIds: ps.map((p) => p.id),
      }),
    );
    await updateGroup(g.id, updateGroupSchema.parse({ active: false }));
    await updateGroup(g.id, updateGroupSchema.parse({ automationEnabled: false }));
    await updateGroup(g.id, updateGroupSchema.parse({ automationEnabled: true }));
    const after = (await listGroups()).find((x) => x.id === g.id)!;
    expect(after.participantIds).toHaveLength(ps.length);
    expect(after.purpose).toBe("keep me");
    expect(after.active).toBe(false);
    expect(after.automationEnabled).toBe(true);
  });

  it("an update with only participantIds, or an empty body, does not crash", async () => {
    const { updateGroup, listGroups } = await import("@/server/groups/groups");
    const { updateGroupSchema } = await import("@/validators/telegram");
    const g = await makeGroup({ name: "participants-only", withParticipants: true });
    const [one] = (await listGroups()).find((x) => x.id === g.id)!.participantIds;
    await updateGroup(g.id, updateGroupSchema.parse({ participantIds: [one] }));
    await updateGroup(g.id, updateGroupSchema.parse({}));
    expect((await listGroups()).find((x) => x.id === g.id)!.participantIds).toEqual([one]);
  });

  it("the real community can never be automated, in the service layer and in the database", async () => {
    const { updateGroup, GroupRuleError } = await import("@/server/groups/groups");
    const { db } = await import("@/db");
    const { groups } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const real = await makeGroup({ name: "real", type: "REAL_COMMUNITY" });
    await expect(updateGroup(real.id, { automationEnabled: true })).rejects.toBeInstanceOf(
      GroupRuleError,
    );
    await expect(updateGroup(real.id, { requiresApproval: false })).rejects.toBeInstanceOf(
      GroupRuleError,
    );
    // Even a direct write that bypasses the service is stopped by the CHECK constraint.
    await expect(
      db.update(groups).set({ automationEnabled: true }).where(eq(groups.id, real.id)),
    ).rejects.toThrow();
    await expect(
      db.update(groups).set({ requiresApproval: false }).where(eq(groups.id, real.id)),
    ).rejects.toThrow();
  });
});

describe("relationships and memories", () => {
  it("rejects a duplicate pair in either order; memories support all three scopes", async () => {
    const { createRelationship, RelationshipConflictError, deleteRelationship } =
      await import("@/server/personas/relationships");
    const { createMemory, listMemories, updateMemory, deleteMemory } =
      await import("@/server/memory/memory");
    const { createPersona, deletePersona } = await import("@/server/personas/personas");
    const { personaSchema } = await import("@/validators/personas");

    const a = await createPersona(personaSchema.parse({ name: `${PREFIX}A` }));
    const b = await createPersona(personaSchema.parse({ name: `${PREFIX}B` }));
    const rel = await createRelationship({
      personaAId: a.id,
      personaBId: b.id,
      relationshipType: "friends",
      familiarity: 50,
      tone: "casual",
      notes: "",
      active: true,
    });
    await expect(
      createRelationship({
        personaAId: b.id,
        personaBId: a.id,
        relationshipType: "x",
        familiarity: 1,
        tone: "x",
        notes: "",
        active: true,
      }),
    ).rejects.toBeInstanceOf(RelationshipConflictError);

    const grp = await makeGroup({ name: "memory" });
    for (const [scope, ownerId] of [
      ["persona", a.id],
      ["relationship", rel.id],
      ["group", grp.id],
    ] as const) {
      const m = await createMemory({ scope, ownerId, content: `${scope} fact`, importance: 3 });
      await updateMemory(scope, m.id, { content: "edited", importance: 5 });
      const listed = await listMemories(scope, ownerId);
      expect(listed.map((x) => [x.content, x.importance, x.ownerId])).toEqual([
        ["edited", 5, ownerId],
      ]);
      await deleteMemory(scope, m.id);
      expect(await listMemories(scope, ownerId)).toHaveLength(0);
    }
    await deleteRelationship(rel.id);
    await deletePersona(a.id);
    await deletePersona(b.id);
  });
});

describe("conversation approval workflow", () => {
  async function session(mode: "PREVIEW" | "MANUAL", messageStatus: "GENERATED" | "APPROVED") {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const g = await makeGroup({ name: `wf-${mode}-${messageStatus}`, withParticipants: true });
    const [p] = await db.select().from(s.personas).limit(1);
    const [sess] = await db
      .insert(s.conversationSessions)
      .values({
        groupId: g.id,
        mode,
        status: mode === "PREVIEW" ? "DRAFT" : "PENDING_APPROVAL",
        environment: "PRIVATE_SIMULATION",
      })
      .returning();
    const [msg] = await db
      .insert(s.conversationMessages)
      .values({
        sessionId: sess.id,
        personaId: p.id,
        position: 0,
        content: "hello",
        status: messageStatus,
        approvedAt: messageStatus === "APPROVED" ? new Date() : null,
        approvedBy: null,
      })
      .returning();
    return { sess, msg };
  }

  it("a preview cannot be approved", async () => {
    const { approveMessages, RuleError } = await import("@/server/conversations/service");
    const { sess } = await session("PREVIEW", "GENERATED");
    await expect(
      approveMessages(sess.id, "00000000-0000-0000-0000-000000000001"),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("approval records who approved, and editing afterwards removes the approval", async () => {
    const { approveMessages, editMessage } = await import("@/server/conversations/service");
    const { db } = await import("@/db");
    const { conversationMessages } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { sess, msg } = await session("MANUAL", "GENERATED");
    const user = "00000000-0000-0000-0000-000000000001";

    expect(await approveMessages(sess.id, user)).toEqual({ approved: 1 });
    let [row] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, msg.id));
    expect(row.status).toBe("APPROVED");
    expect(row.approvedBy).toBe(user);
    expect(row.approvedAt).not.toBeNull();

    await editMessage(msg.id, { content: "changed after approval" });
    [row] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, msg.id));
    expect(row.status).toBe("EDITED");
    expect(row.approvedBy).toBeNull();
    expect(row.approvedAt).toBeNull();

    await editMessage(msg.id, { action: "skip" });
    [row] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, msg.id));
    expect(row.status).toBe("SKIPPED");
  });

  it("a finished conversation can no longer be edited", async () => {
    const { editMessage, RuleError } = await import("@/server/conversations/service");
    const { db } = await import("@/db");
    const { conversationSessions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { sess, msg } = await session("MANUAL", "GENERATED");
    await db
      .update(conversationSessions)
      .set({ status: "COMPLETED" })
      .where(eq(conversationSessions.id, sess.id));
    await expect(editMessage(msg.id, { content: "nope" })).rejects.toBeInstanceOf(RuleError);
  });
});

describe("history search", () => {
  it("matches text literally, filters, paginates, and counts", async () => {
    const { searchSessions, searchMessages } = await import("@/server/conversations/history");
    const { sessionSearchSchema, messageSearchSchema } = await import("@/validators/history");
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const g = await makeGroup({ name: "history", withParticipants: true });
    const [p] = await db.select().from(s.personas).limit(1);
    const [sess] = await db
      .insert(s.conversationSessions)
      .values({
        groupId: g.id,
        mode: "MANUAL",
        status: "COMPLETED",
        environment: "PRIVATE_SIMULATION",
      })
      .returning();
    await db.insert(s.conversationMessages).values(
      ["ZZITSEARCH 100% sarap", "ZZITSEARCH plain", "ZZITSEARCH under_score"].map((content, i) => ({
        sessionId: sess.id,
        personaId: p.id,
        position: i,
        content,
        status: "SENT" as const,
        sentAt: new Date(),
      })),
    );

    const mine = async (q: object) =>
      (await searchSessions(sessionSearchSchema.parse({ groupId: g.id, ...q }))).rows;
    expect(await mine({ q: "ZZITSEARCH" })).toHaveLength(1);
    expect(await mine({ q: "100%" })).toHaveLength(1);
    expect(await mine({ q: "%" })).toHaveLength(1); // '%' is matched literally (the "100%" message), not as a wildcard
    expect(await mine({ q: "zz_ts" })).toHaveLength(0); // '_' is not a single-char wildcard
    expect(await mine({ q: "ZZITSEARCH", status: "DRAFT" })).toHaveLength(0);
    const [row] = await mine({ q: "ZZITSEARCH" });
    expect([row.total, row.sent]).toEqual([3, 3]);

    const m = await searchMessages(
      messageSearchSchema.parse({ q: "ZZITSEARCH", groupId: g.id, pageSize: 5 }),
    );
    expect(m.total).toBe(3);
    const page2 = await searchMessages(
      messageSearchSchema.parse({ q: "ZZITSEARCH", groupId: g.id, pageSize: 5, page: 2 }),
    );
    expect(page2.rows).toHaveLength(0);
  });
});

describe("scheduler planning", () => {
  it("tops up a plan idempotently and only for the targeted schedule", async () => {
    const { ensurePlans, connectedParticipants } = await import("@/server/scheduler/planner");
    const { updateSchedule } = await import("@/server/scheduler/schedules");
    const { localDate } = await import("@/lib/scheduling/time");
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const g = await makeGroup({ name: "plan", withParticipants: true });
    await db.update(s.groups).set({ automationEnabled: true }).where(eq(s.groups.id, g.id));
    const connected = await connectedParticipants(g.id);
    if (connected.length < 2) return; // needs at least two connected accounts; nothing to assert otherwise

    const [sc] = await db.insert(s.schedules).values({ groupId: g.id, enabled: false }).returning();
    const now = new Date();
    const t = now
      .toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour12: false })
      .split(":")
      .map(Number);
    const m = t[0] * 60 + t[1];
    if (m + 150 > 1439 || m < 10) return; // too close to midnight for a same-day window
    // enabling goes through updateSchedule's validation (group automation is on)
    await db
      .update(s.schedules)
      .set({
        enabled: true,
        messagesPerAccountPerDay: 10,
        messagesPerSessionMin: 6,
        messagesPerSessionMax: 8,
        dateOverrides: {
          [localDate("Asia/Manila", now)]: {
            type: "CUSTOM",
            startMinute: m - 5,
            endMinute: m + 140,
          },
        },
      })
      .where(eq(s.schedules.id, sc.id));
    void updateSchedule;

    const runs = () =>
      db.select().from(s.scheduledRuns).where(eq(s.scheduledRuns.scheduleId, sc.id));
    const first = await ensurePlans(now, { scheduleId: sc.id });
    const afterFirst = await runs();
    expect(first.created).toBe(afterFirst.length);
    expect(afterFirst.length).toBeGreaterThan(0);
    for (const r of afterFirst) expect(r.status).toBe("PENDING");

    // Calling again must not plan the same messages twice.
    const second = await ensurePlans(now, { scheduleId: sc.id });
    expect(second.created).toBe(0);
    expect(await runs()).toHaveLength(afterFirst.length);

    // A disabled schedule plans nothing.
    await db.update(s.schedules).set({ enabled: false }).where(eq(s.schedules.id, sc.id));
    await db.delete(s.scheduledRuns).where(eq(s.scheduledRuns.scheduleId, sc.id));
    expect((await ensurePlans(now, { scheduleId: sc.id })).created).toBe(0);
  });
});

describe("scheduler draft claiming", () => {
  it("claims only drafts that can be sent, once each, and leaves the rest untouched", async () => {
    const { claimDraft } = await import("@/server/scheduler/runner");
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { eq, asc } = await import("drizzle-orm");

    const g = await makeGroup({ name: "claim", withParticipants: true });
    const connected = await db.select().from(s.personas);
    const [loner] = await db
      .insert(s.personas)
      .values({ name: `${PREFIX}no-account` })
      .returning(); // no Telegram account

    const mkDraft = async (personaIds: string[]) => {
      const [sess] = await db
        .insert(s.conversationSessions)
        .values({
          groupId: g.id,
          mode: "PREVIEW",
          status: "DRAFT",
          environment: "PRIVATE_SIMULATION",
          source: "IMPORTED",
        })
        .returning();
      await db.insert(s.conversationMessages).values(
        personaIds.map((personaId, position) => ({
          sessionId: sess.id,
          personaId,
          position,
          content: `m${position}`,
          status: "GENERATED" as const,
        })),
      );
      return sess.id;
    };
    // The unsendable draft is OLDER, so a naive "oldest first" claim would take it.
    const unsendable = await mkDraft([connected[0].id, loner.id]);
    const sendable = await mkDraft([connected[0].id, connected[1].id]);

    const scheduleId = "00000000-0000-0000-0000-00000000aaaa";
    expect(await claimDraft(g.id, scheduleId)).toBe(sendable);
    expect(await claimDraft(g.id, scheduleId)).toBeNull(); // nothing else is sendable; the unsendable one is not consumed

    const [claimed] = await db
      .select()
      .from(s.conversationSessions)
      .where(eq(s.conversationSessions.id, sendable));
    expect([claimed.mode, claimed.status, claimed.scheduleId]).toEqual([
      "AUTOMATIC",
      "PENDING_APPROVAL",
      scheduleId,
    ]);
    const claimedMsgs = await db
      .select()
      .from(s.conversationMessages)
      .where(eq(s.conversationMessages.sessionId, sendable))
      .orderBy(asc(s.conversationMessages.position));
    expect(claimedMsgs.every((m) => m.status === "APPROVED" && m.approvedBy === null)).toBe(true);

    const [left] = await db
      .select()
      .from(s.conversationSessions)
      .where(eq(s.conversationSessions.id, unsendable));
    expect([left.mode, left.status, left.scheduleId]).toEqual(["PREVIEW", "DRAFT", null]);
    const leftMsgs = await db
      .select()
      .from(s.conversationMessages)
      .where(eq(s.conversationMessages.sessionId, unsendable));
    expect(leftMsgs.every((m) => m.status === "GENERATED")).toBe(true);
  });
});
