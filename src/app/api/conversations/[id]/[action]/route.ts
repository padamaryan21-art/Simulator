import { z } from "zod";
import { mapDomain } from "@/lib/api-errors";
import { route } from "@/lib/api";
import {
  approveMessages,
  cancelSession,
  enableSending,
  startSend,
} from "@/server/conversations/service";
import { approveSchema } from "@/validators/conversations";

const params = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "enable-sending", "send", "cancel"]),
});

export const POST = route<{ id: string; action: string }>(async ({ params: raw, body, userId }) => {
  const { id, action } = params.parse(raw);
  return mapDomain(async () => {
    switch (action) {
      case "approve":
        return approveMessages(id, userId, (await body(approveSchema)).messageIds);
      case "enable-sending":
        return enableSending(id);
      case "send":
        return startSend(id, userId);
      case "cancel":
        await cancelSession(id, userId);
        return { ok: true };
    }
  });
});
