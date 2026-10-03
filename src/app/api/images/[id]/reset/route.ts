import { z } from "zod";
import { HttpError, route } from "@/lib/api";
import { writeLog } from "@/server/conversations/logs";
import { ImageError, resetImage } from "@/server/images/service";

/** Makes a never-posted image available again (refused for pictures that really went out). */
export const POST = route<{ id: string }>(async ({ params, userId }) => {
  const id = z.string().uuid().parse(params.id);
  try {
    await resetImage(id);
    await writeLog("info", "images", "Image released", { imageId: id, actorId: userId });
    return { ok: true };
  } catch (err) {
    if (err instanceof ImageError) throw new HttpError(400, err.message);
    throw err;
  }
});
