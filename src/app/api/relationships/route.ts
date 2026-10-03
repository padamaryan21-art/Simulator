import { HttpError, route } from "@/lib/api";
import {
  RelationshipConflictError,
  createRelationship,
  listRelationships,
} from "@/server/personas/relationships";
import { relationshipSchema } from "@/validators/personas";

export const GET = route(async () => listRelationships());

export const POST = route(async ({ body }) => {
  const input = await body(relationshipSchema);
  try {
    return await createRelationship(input);
  } catch (err) {
    if (err instanceof RelationshipConflictError) throw new HttpError(409, err.message);
    throw err;
  }
});
