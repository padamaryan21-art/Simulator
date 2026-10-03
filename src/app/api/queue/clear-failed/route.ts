import { HttpError, route } from "@/lib/api";
import { redisConfigured } from "@/server/queues/names";
import { clearFailedJobs } from "@/server/queues/status";

export const POST = route(async () => {
  if (!redisConfigured()) throw new HttpError(400, "Redis is not configured");
  return clearFailedJobs();
});
