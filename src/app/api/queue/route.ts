import { route } from "@/lib/api";
import { getQueueStatus } from "@/server/queues/status";

export const GET = route(async () => getQueueStatus());
