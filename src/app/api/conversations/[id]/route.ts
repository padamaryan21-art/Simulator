import { z } from "zod";
import { notFound, route } from "@/lib/api";
import { getSession } from "@/server/conversations/service";

export const GET = route<{ id: string }>(async ({ params }) => {
  const data = await getSession(z.string().uuid().parse(params.id));
  if (!data) throw notFound();
  return data;
});
