import { route } from "@/lib/api";
import { setFactsStatus } from "@/server/knowledge/service";
import { factBulkSchema } from "@/validators/knowledge";

export const POST = route(async ({ body }) => {
  const { ids, status } = await body(factBulkSchema);
  return setFactsStatus(ids, status);
});
