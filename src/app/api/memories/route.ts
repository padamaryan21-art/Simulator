import { z } from "zod";
import { route } from "@/lib/api";
import { createMemory, listMemories } from "@/server/memory/memory";
import { MEMORY_SCOPES, memoryCreateSchema } from "@/validators/personas";

const query = z.object({
  scope: z.enum(MEMORY_SCOPES),
  ownerId: z.string().uuid().optional(),
});

export const GET = route(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { scope, ownerId } = query.parse({
    scope: sp.get("scope"),
    ownerId: sp.get("ownerId") ?? undefined,
  });
  return listMemories(scope, ownerId);
});

export const POST = route(async ({ body }) => createMemory(await body(memoryCreateSchema)));
