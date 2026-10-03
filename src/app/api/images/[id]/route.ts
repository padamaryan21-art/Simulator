import { z } from "zod";
import { HttpError, notFound, route } from "@/lib/api";
import { ImageError, deleteImage, updateImage } from "@/server/images/service";
import { imageUpdateSchema } from "@/validators/images";

const idParam = z.object({ id: z.string().uuid() });

export const PATCH = route<{ id: string }>(async ({ params, body }) => {
  const { id } = idParam.parse(params);
  try {
    const row = await updateImage(id, await body(imageUpdateSchema));
    if (!row) throw notFound();
    return row;
  } catch (err) {
    if (err instanceof ImageError) throw new HttpError(400, err.message);
    throw err;
  }
});

export const DELETE = route<{ id: string }>(async ({ params }) => {
  try {
    await deleteImage(idParam.parse(params).id);
  } catch (err) {
    if (err instanceof ImageError) throw new HttpError(400, err.message);
    throw err;
  }
});
