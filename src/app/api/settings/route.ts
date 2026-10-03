import { route } from "@/lib/api";
import { getPool, isFreeProvider } from "@/server/llm/client";
import { getEnv } from "@/lib/env";
import { getSetting, setSetting } from "@/server/settings/settings";
import { sendingSettingsSchema } from "@/validators/settings";

export const GET = route(async () => ({
  sending: await getSetting("sending"),
  llm: {
    strategy: getEnv().LLM_STRATEGY,
    pool: getPool().map((e) => ({ ...e, free: isFreeProvider(e.provider) })),
  },
}));

export const PATCH = route(async ({ body }) => ({
  sending: await setSetting("sending", await body(sendingSettingsSchema)),
}));
