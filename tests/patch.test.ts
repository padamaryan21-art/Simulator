import { describe, expect, it } from "vitest";
import { personaUpdateSchema } from "@/validators/personas";
import { updateGroupSchema } from "@/validators/telegram";
import { topicUpdateSchema } from "@/validators/topics";
import { messageEditSchema } from "@/validators/conversations";
import { relationshipUpdateSchema, memoryUpdateSchema } from "@/validators/personas";
import { scheduleUpdateSchema } from "@/validators/schedules";
import { factUpdateSchema } from "@/validators/knowledge";
import { imageUpdateSchema } from "@/validators/images";
import { imageSettingsSchema } from "@/validators/settings";

/**
 * Regression: PATCH bodies must contain ONLY the fields the client sent. Zod 4's `.partial()`
 * re-applies `.default()`, which once wiped group participants, persona profiles and topic
 * settings whenever a single toggle was flipped.
 */
describe("PATCH schemas never inject defaults", () => {
  it("group: toggling active changes only active", () => {
    expect(updateGroupSchema.parse({ active: false })).toEqual({ active: false });
    expect(updateGroupSchema.parse({ automationEnabled: true })).toEqual({
      automationEnabled: true,
    });
  });

  it("persona: toggling active changes only active (profile and account link survive)", () => {
    expect(personaUpdateSchema.parse({ active: false })).toEqual({ active: false });
    expect(personaUpdateSchema.parse({ personality: "x" })).toEqual({ personality: "x" });
  });

  it("topic: toggling active changes only active", () => {
    expect(topicUpdateSchema.parse({ active: false })).toEqual({ active: false });
  });

  it("an empty body is an empty patch", () => {
    expect(updateGroupSchema.parse({})).toEqual({});
    expect(personaUpdateSchema.parse({})).toEqual({});
    expect(topicUpdateSchema.parse({})).toEqual({});
  });

  it("still validates the fields that are sent", () => {
    expect(updateGroupSchema.safeParse({ name: "" }).success).toBe(false);
    expect(personaUpdateSchema.safeParse({ tagalogLevel: 500 }).success).toBe(false);
    expect(topicUpdateSchema.safeParse({ priority: 99 }).success).toBe(false);
  });

  it("all other PATCH-style schemas are free of defaults too", () => {
    expect(relationshipUpdateSchema.parse({ active: false })).toEqual({ active: false });
    expect(memoryUpdateSchema.parse({ importance: 4 })).toEqual({ importance: 4 });
    expect(scheduleUpdateSchema.parse({ enabled: false })).toEqual({ enabled: false });
    expect(factUpdateSchema.parse({ status: "CONFIRMED" })).toEqual({ status: "CONFIRMED" });
    expect(messageEditSchema.parse({ action: "skip" })).toEqual({ action: "skip" });
  });

  it("image updates and the picture attach/remove edit carry only what was sent", () => {
    expect(imageUpdateSchema.parse({ enabled: false })).toEqual({ enabled: false });
    expect(imageUpdateSchema.parse({ topicId: null })).toEqual({ topicId: null });
    expect(messageEditSchema.parse({ imageId: null })).toEqual({ imageId: null });
    expect(messageEditSchema.safeParse({}).success).toBe(false); // an empty edit is rejected
    expect(imageSettingsSchema.safeParse({ enabled: true, chancePercent: 101 }).success).toBe(
      false,
    );
  });
});
