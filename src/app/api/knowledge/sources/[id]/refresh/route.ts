import { z } from "zod";
import { route } from "@/lib/api";
import { mapKnowledge } from "@/lib/api-errors";
import { refreshSource } from "@/server/knowledge/service";

// Rendering JS sites and extracting facts can take a while.
export const maxDuration = 180;

export const POST = route<{ id: string }>(
  async ({ params }) =>
    mapKnowledge(async () => ({
      results: await refreshSource(z.string().uuid().parse(params.id)),
    })),
  { rateLimit: { limit: 6, windowSec: 60 } },
);
