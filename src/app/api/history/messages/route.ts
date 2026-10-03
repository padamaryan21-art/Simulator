import { route } from "@/lib/api";
import { searchMessages } from "@/server/conversations/history";
import { messageSearchSchema } from "@/validators/history";

export const GET = route(async ({ req }) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return searchMessages(messageSearchSchema.parse(params));
});
