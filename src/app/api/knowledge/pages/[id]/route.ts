import { z } from "zod";
import { route } from "@/lib/api";
import { mapKnowledge } from "@/lib/api-errors";
import { deletePage, refreshPage } from "@/server/knowledge/service";

export const maxDuration = 180;

/** POST = refresh this page. */
export const POST = route<{ id: string }>(async ({ params }) =>
  mapKnowledge(() => refreshPage(z.string().uuid().parse(params.id))),
);

export const DELETE = route<{ id: string }>(async ({ params }) => {
  await deletePage(z.string().uuid().parse(params.id));
});
