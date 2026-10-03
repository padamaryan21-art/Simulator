import { route } from "@/lib/api";
import { createGroup, listGroups } from "@/server/groups/groups";
import { createGroupSchema } from "@/validators/telegram";

export const GET = route(async () => listGroups());

export const POST = route(async ({ body }) => createGroup(await body(createGroupSchema)));
