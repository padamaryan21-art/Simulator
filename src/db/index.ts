import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

/**
 * Supabase's pooler has only a handful of server connections on the free plan (about 15), and the
 * dashboard, the worker and any scripts all share them. So each process keeps a SMALL pool and
 * releases idle connections quickly instead of hoarding them. Raise DB_POOL_MAX on a paid plan.
 */
const max = Math.max(1, Number(process.env.DB_POOL_MAX ?? 4) || 4);

const client =
  globalForDb.pgClient ??
  postgres(getEnv().DATABASE_URL, {
    // Supabase pooler (transaction mode) does not support prepared statements.
    prepare: false,
    max,
    idle_timeout: 20, // seconds; give idle connections back to the pooler
    max_lifetime: 60 * 30,
    connect_timeout: 15,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
