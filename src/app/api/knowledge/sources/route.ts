import { route } from "@/lib/api";
import { mapKnowledge } from "@/lib/api-errors";
import { addSource } from "@/server/knowledge/service";
import { sourceSchema } from "@/validators/knowledge";

export const POST = route(async ({ body }) =>
  mapKnowledge(async () => addSource(await body(sourceSchema))),
);
