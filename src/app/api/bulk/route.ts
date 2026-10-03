import { route, HttpError } from "@/lib/api";
import { cancelBulk, getBulkJob, startBulk } from "@/server/conversations/bulk";
import { RuleError } from "@/server/conversations/service";
import { bulkSchema } from "@/validators/bulk";

export const GET = route(async () => ({ job: getBulkJob() }));

export const POST = route(
  async ({ body, userId }) => {
    const input = await body(bulkSchema);
    try {
      return { job: await startBulk(input, userId) };
    } catch (err) {
      if (err instanceof RuleError) throw new HttpError(400, err.message);
      throw err;
    }
  },
  { rateLimit: { limit: 3, windowSec: 60 } },
);

export const DELETE = route(async () => {
  cancelBulk();
  return { job: getBulkJob() };
});
