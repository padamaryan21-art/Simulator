import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { ScheduleError, updateSchedule } from "@/server/scheduler/schedules";
import { writeLog } from "@/server/conversations/logs";
import { scheduleUpdateSchema } from "@/validators/schedules";

export const PATCH = route<{ id: string }>(async ({ params, body, userId }) => {
  const id = z.string().uuid().parse(params.id);
  const patch = await body(scheduleUpdateSchema);
  try {
    const row = await updateSchedule(id, patch);
    await writeLog("info", "scheduler", "Schedule updated", {
      scheduleId: id,
      fields: Object.keys(patch),
      actorId: userId,
    });
    return row;
  } catch (err) {
    if (err instanceof ScheduleError) throw new HttpError(400, err.message);
    throw err;
  }
});
