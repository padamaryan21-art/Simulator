/**
 * Pure business rules for approval and sending. Kept free of I/O so they can be unit-tested
 * and so there is exactly one place that decides whether something may be posted.
 */

export type Environment = "PRIVATE_SIMULATION" | "REAL_COMMUNITY";
export type Mode = "PREVIEW" | "MANUAL" | "AUTOMATIC";
export type AutomationState = "STOPPED" | "RUNNING" | "PAUSED";

export class RuleError extends Error {}

export function assertModeAllowed(
  mode: Mode,
  group: { type: Environment; automationEnabled: boolean },
  automation: AutomationState,
) {
  if (mode !== "AUTOMATIC") return;
  if (group.type !== "PRIVATE_SIMULATION") {
    throw new RuleError("Automatic mode is only available for private simulation groups.");
  }
  if (!group.automationEnabled) {
    throw new RuleError("Automation is turned off for this group. Enable it on the Groups page.");
  }
  if (automation !== "RUNNING") {
    throw new RuleError(`Automation is ${automation.toLowerCase()}. Use START ALL first.`);
  }
}

export type SendableMessage = {
  status: string;
  approvedBy: string | null;
  approvedAt: Date | null;
};

/**
 * Decides whether a message may be posted right now.
 * REAL_COMMUNITY: only messages a named human approved. Never automated.
 */
export function assertMessageSendable(
  msg: SendableMessage,
  ctx: { environment: Environment; mode: Mode; automation: AutomationState },
) {
  if (ctx.mode === "PREVIEW") throw new RuleError("Preview sessions cannot be sent.");
  if (msg.status !== "APPROVED") throw new RuleError("Message is not approved.");
  if (ctx.environment === "REAL_COMMUNITY") {
    if (ctx.mode === "AUTOMATIC") throw new RuleError("The real community can never be automated.");
    if (!msg.approvedBy || !msg.approvedAt) {
      throw new RuleError("Real community messages require approval by a signed-in person.");
    }
  }
  if (ctx.mode === "AUTOMATIC" && ctx.automation !== "RUNNING") {
    throw new RuleError("Automation is not running.");
  }
}

export function canEditSession(status: string) {
  return status === "DRAFT" || status === "PENDING_APPROVAL";
}

/** Editing an approved message invalidates its approval. */
export function statusAfterEdit() {
  return "EDITED" as const;
}

export function isApprovable(status: string) {
  return status === "GENERATED" || status === "EDITED";
}

/** Random delay (seconds) between messages; longer messages wait a bit longer (typing time). */
export function pickDelaySeconds(
  s: { minDelaySec: number; maxDelaySec: number },
  textLength: number,
  rand = Math.random,
) {
  const base = s.minDelaySec + rand() * (s.maxDelaySec - s.minDelaySec);
  const typing = Math.min(20, textLength * 0.05);
  return Math.round((base + (s.maxDelaySec === 0 ? 0 : typing)) * 10) / 10;
}
