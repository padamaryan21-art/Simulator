import { route } from "@/lib/api";
import { getSetting, setSetting } from "@/server/settings/settings";
import { imageSettingsSchema } from "@/validators/settings";

export const GET = route(async () => getSetting("images"));

export const PATCH = route(async ({ body }) =>
  setSetting("images", await body(imageSettingsSchema)),
);
