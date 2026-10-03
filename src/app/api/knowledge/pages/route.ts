import { route } from "@/lib/api";
import { mapKnowledge } from "@/lib/api-errors";
import { addPage } from "@/server/knowledge/service";
import { pageSchema } from "@/validators/knowledge";

export const maxDuration = 180;

export const POST = route(
  async ({ body }) => mapKnowledge(async () => addPage(await body(pageSchema))),
  { rateLimit: { limit: 10, windowSec: 60 } },
);
