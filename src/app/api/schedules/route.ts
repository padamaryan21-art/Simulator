import { route } from "@/lib/api";
import { listScheduleViews } from "@/server/scheduler/schedules";

export const GET = route(async () => listScheduleViews());
