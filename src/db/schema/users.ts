import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./_shared";

/** Dashboard user profile. `id` mirrors Supabase auth.users.id. */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role", { enum: ["admin", "operator"] })
    .notNull()
    .default("operator"),
  createdAt: createdAt(),
}).enableRLS();
