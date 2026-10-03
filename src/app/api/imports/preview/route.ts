import { HttpError, route } from "@/lib/api";
import { ImportError, previewImport } from "@/server/imports/service";
import { MAX_FILE_BYTES } from "@/server/imports/files";
import { previewFieldsSchema } from "@/validators/imports";

export const maxDuration = 120;

/** multipart/form-data: file, groupId, minSize?, maxSize?. Analyses the file; creates nothing. */
export const POST = route(
  async ({ req }) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, "Expected a file upload.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
    if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "The file is larger than 4 MB.");
    const fields = previewFieldsSchema.parse({
      groupId: form.get("groupId"),
      minSize: form.get("minSize") ?? undefined,
      maxSize: form.get("maxSize") ?? undefined,
    });
    try {
      return await previewImport({
        ...fields,
        filename: file.name,
        data: Buffer.from(await file.arrayBuffer()),
      });
    } catch (err) {
      if (err instanceof ImportError) throw new HttpError(400, err.message);
      throw err;
    }
  },
  { rateLimit: { limit: 8, windowSec: 60 } },
);
