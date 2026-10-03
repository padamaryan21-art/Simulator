import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { requireEnv } from "./env";

/** AES-256-GCM. Output format: v1.<iv>.<tag>.<ciphertext> (all base64url). */
function getKey(): Buffer {
  const raw = requireEnv("SESSION_ENCRYPTION_KEY");
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).");
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, enc]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, enc] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !enc) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}
