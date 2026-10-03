import { route } from "@/lib/api";
import { searchSessions } from "@/server/conversations/history";
import { sessionSearchSchema } from "@/validators/history";

export const GET = route(async ({ req }) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return searchSessions(sessionSearchSchema.parse(params));
});
