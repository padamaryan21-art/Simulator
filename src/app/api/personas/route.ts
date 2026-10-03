import { route } from "@/lib/api";
import { createPersona, listPersonas } from "@/server/personas/personas";
import { personaSchema } from "@/validators/personas";

export const GET = route(async () => listPersonas());

export const POST = route(async ({ body }) => createPersona(await body(personaSchema)));
