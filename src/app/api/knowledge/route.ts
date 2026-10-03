import { route } from "@/lib/api";
import { listKnowledge } from "@/server/knowledge/service";

export const GET = route(async () => listKnowledge());
