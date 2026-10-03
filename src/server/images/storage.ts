import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * Image files live in a PRIVATE Supabase Storage bucket. Nothing is public: the dashboard shows
 * them through an authenticated route, and the worker downloads the bytes to send them.
 */
export const BUCKET = "conversation-images";

const g = globalThis as unknown as { __imgBucketReady?: Promise<void> };

function admin() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Creates the private bucket on first use (idempotent). */
export function ensureBucket(): Promise<void> {
  return (g.__imgBucketReady ??= (async () => {
    const sb = admin();
    const { data, error } = await sb.storage.listBuckets();
    if (error) throw new Error(`Storage unavailable: ${error.message}`);
    if (data.some((b) => b.name === BUCKET)) return;
    const created = await sb.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 6 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg"],
    });
    if (created.error && !/already exists/i.test(created.error.message)) {
      g.__imgBucketReady = undefined;
      throw new Error(`Could not create the image bucket: ${created.error.message}`);
    }
  })());
}

export async function putImage(path: string, data: Buffer): Promise<void> {
  await ensureBucket();
  const { error } = await admin()
    .storage.from(BUCKET)
    .upload(path, data, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export async function getImageBytes(path: string): Promise<Buffer> {
  await ensureBucket();
  const { data, error } = await admin().storage.from(BUCKET).download(path);
  if (error || !data)
    throw new Error(`Could not read the image file: ${error?.message ?? "missing"}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function removeImages(paths: string[]): Promise<void> {
  if (!paths.length) return;
  await ensureBucket();
  await admin().storage.from(BUCKET).remove(paths);
}
