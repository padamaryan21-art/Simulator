import { route } from "@/lib/api";
import { writeLog } from "@/server/conversations/logs";
import { deleteSessions } from "@/server/conversations/history";
import { deleteSessionsSchema } from "@/validators/history";

export const POST = route(async ({ body, userId }) => {
  const { ids } = await body(deleteSessionsSchema);
  const result = await deleteSessions(ids);
  await writeLog("warn", "history", "Conversations deleted", { ...result, actorId: userId });
  return result;
});
