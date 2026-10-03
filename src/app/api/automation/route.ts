import { z } from "zod";
import { route } from "@/lib/api";
import { applyControl, getAutomationState } from "@/server/scheduler/control";

export const GET = route(async () => ({ state: await getAutomationState() }));

export const POST = route(async ({ body, userId }) => {
  const { action } = await body(z.object({ action: z.enum(["start", "pause", "resume", "stop"]) }));
  return applyControl(action, userId);
});
