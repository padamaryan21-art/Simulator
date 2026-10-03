import { z } from "zod";
import { route } from "@/lib/api";
import { deleteSource } from "@/server/knowledge/service";

export const DELETE = route<{ id: string }>(async ({ params }) => {
  await deleteSource(z.string().uuid().parse(params.id));
});
