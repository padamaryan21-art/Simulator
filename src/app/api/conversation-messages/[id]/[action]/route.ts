import { z } from "zod";
import { mapDomain } from "@/lib/api-errors";
import { route } from "@/lib/api";
import { regenerateMessageById } from "@/server/conversations/service";

const params = z.object({ id: z.string().uuid(), action: z.literal("regenerate") });

export const maxDuration = 90;

export const POST = route<{ id: string; action: string }>(
  async ({ params: raw }) => {
    const { id } = params.parse(raw);
    return mapDomain(() => regenerateMessageById(id));
  },
  { rateLimit: { limit: 30, windowSec: 60 } },
);
