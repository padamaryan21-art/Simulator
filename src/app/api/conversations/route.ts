import { mapDomain } from "@/lib/api-errors";
import { route } from "@/lib/api";
import { createConversation, listSessions } from "@/server/conversations/service";
import { createConversationSchema } from "@/validators/conversations";

export const GET = route(async () => listSessions());

// Generation can take a while on free models.
export const maxDuration = 120;

export const POST = route(
  async ({ body, userId }) => {
    const input = await body(createConversationSchema);
    return mapDomain(() => createConversation(input, userId));
  },
  { rateLimit: { limit: 10, windowSec: 60 } },
);
