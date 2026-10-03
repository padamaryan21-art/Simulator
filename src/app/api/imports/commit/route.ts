import { HttpError, route } from "@/lib/api";
import { commitImport, ImportError } from "@/server/imports/service";
import { commitSchema } from "@/validators/imports";

export const maxDuration = 120;

export const POST = route(
  async ({ body, userId }) => {
    const input = await body(commitSchema);
    try {
      return await commitImport(input, userId);
    } catch (err) {
      if (err instanceof ImportError) throw new HttpError(400, err.message);
      throw err;
    }
  },
  { rateLimit: { limit: 6, windowSec: 60 } },
);
