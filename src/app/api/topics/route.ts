import { route } from "@/lib/api";
import { createTopic, listCategories, listTopics } from "@/server/conversations/topics";
import { topicSchema } from "@/validators/topics";

export const GET = route(async () => ({
  categories: await listCategories(),
  topics: await listTopics(),
}));

export const POST = route(async ({ body }) => createTopic(await body(topicSchema)));
