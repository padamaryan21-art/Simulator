import { route } from "@/lib/api";
import { mapKnowledge } from "@/lib/api-errors";
import { createFact } from "@/server/knowledge/service";
import { factCreateSchema } from "@/validators/knowledge";

export const POST = route(async ({ body }) =>
  mapKnowledge(async () => createFact(await body(factCreateSchema))),
);
