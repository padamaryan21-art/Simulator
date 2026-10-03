import { HttpError, route } from "@/lib/api";
import { ImageError, listImages, uploadImages } from "@/server/images/service";
import { MAX_UPLOAD_BYTES } from "@/server/images/process";
import { imageDefaultsSchema, imageListSchema } from "@/validators/images";

export const GET = route(async ({ req }) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return listImages(imageListSchema.parse(params));
});

export const maxDuration = 120;

/** multipart/form-data: files (1-20), topicId?, personaId?, kind?, caption? */
export const POST = route(
  async ({ req, userId }) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, "Expected a file upload.");
    }
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) throw new HttpError(400, "Choose at least one picture.");
    if (files.some((f) => f.size > MAX_UPLOAD_BYTES))
      throw new HttpError(413, "A picture is larger than 4 MB.");
    // Vercel rejects any request over 4.5 MB before it reaches us, so keep the whole upload under it.
    if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES)
      throw new HttpError(413, "Upload at most 4 MB of pictures at a time.");
    const defaults = imageDefaultsSchema.parse({
      topicId: form.get("topicId") ?? undefined,
      personaId: form.get("personaId") ?? undefined,
      kind: form.get("kind") ?? undefined,
      caption: form.get("caption") ?? undefined,
    });
    try {
      const results = await uploadImages(
        await Promise.all(
          files.map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })),
        ),
        defaults,
        userId,
      );
      return { results };
    } catch (err) {
      if (err instanceof ImageError) throw new HttpError(400, err.message);
      throw err;
    }
  },
  { rateLimit: { limit: 10, windowSec: 60 } },
);
