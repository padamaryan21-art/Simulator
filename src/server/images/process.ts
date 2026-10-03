import { createHash } from "node:crypto";
import sharp from "sharp";

export class ImageError extends Error {}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Decompression-bomb guard: refuse pictures with an absurd number of pixels. */
const MAX_INPUT_PIXELS = 40_000_000;
/** Telegram recompresses photos anyway; this keeps files small and uniform. */
const MAX_SIDE = 2048;

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const starts = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);

export function detectImage(bytes: Uint8Array): "jpeg" | "png" | null {
  if (starts(bytes, JPEG)) return "jpeg";
  if (starts(bytes, PNG)) return "png";
  return null;
}

export type ProcessedImage = { data: Buffer; width: number; height: number; sha256: string };

/**
 * Validates an upload by its own bytes (not its name), then re-encodes it:
 *  - orientation is applied and ALL metadata is dropped (EXIF can contain the GPS location);
 *  - transparency is flattened onto white;
 *  - it is shrunk to at most 2048 px and saved as a plain JPEG.
 * The hash of the result is used to refuse the same picture twice.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.byteLength === 0) throw new ImageError("The file is empty.");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new ImageError("The picture is larger than 4 MB.");
  if (!detectImage(input)) throw new ImageError("Only JPG or PNG pictures are accepted.");

  try {
    const { data, info } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    })
      .rotate() // honour EXIF orientation, then the metadata is stripped by default on output
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return {
      data,
      width: info.width,
      height: info.height,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  } catch (err) {
    if (err instanceof ImageError) throw err;
    throw new ImageError("The picture could not be read. It may be corrupted or too large.");
  }
}
