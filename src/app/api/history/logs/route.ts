import { route } from "@/lib/api";
import { searchLogs } from "@/server/conversations/history";
import { logSearchSchema } from "@/validators/history";

export const GET = route(async ({ req }) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return searchLogs(logSearchSchema.parse(params));
});
