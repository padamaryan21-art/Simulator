import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import type { ImageSettings, SendingSettings } from "@/validators/settings";

const DEFAULTS: { sending: SendingSettings; images: ImageSettings } = {
  sending: { minDelaySec: 5, maxDelaySec: 45 },
  images: { enabled: true, chancePercent: 60 },
};

type Key = keyof typeof DEFAULTS;

export async function getSetting<K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return { ...DEFAULTS[key], ...((row?.value as object) ?? {}) } as (typeof DEFAULTS)[K];
}

export async function setSetting<K extends Key>(key: K, value: (typeof DEFAULTS)[K]) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  return value;
}
