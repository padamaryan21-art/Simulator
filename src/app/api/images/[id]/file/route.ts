import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { getImage } from "@/server/images/service";
import { getImageBytes } from "@/server/images/storage";

/**
 * The picture's bytes for the dashboard. The storage bucket is private, so this signed-in-only
 * route is the only way a browser can see an image.
 */
export const GET = route<{ id: string }>(async ({ params }) => {
  const img = await getImage(z.string().uuid().parse(params.id));
  if (!img) throw notFound();
  const bytes = await getImageBytes(img.storagePath);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
});
