import { createClient } from "@supabase/supabase-js";
import type { APIRequestContext } from "@playwright/test";
import postgres from "postgres";

export const E2E_PREFIX = "ZZ-E2E-";
export const AUTH_FILE = "tests/e2e/.auth/state.json";
export const CRED_FILE = "tests/e2e/.auth/creds.json";

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Short-lived direct Postgres connection for setup/teardown only (never used by the tests themselves). */
export function sql() {
  return postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
}

/** Creates an isolated private group through the real API (as the signed-in test user). */
export async function createTempGroup(
  request: APIRequestContext,
  name: string,
  opts: { automationEnabled?: boolean; withParticipants?: boolean } = {},
) {
  let participantIds: string[] = [];
  if (opts.withParticipants !== false) {
    const personas = await (await request.get("/api/personas")).json();
    participantIds = personas.map((p: { id: string }) => p.id);
  }
  const res = await request.post("/api/groups", {
    data: {
      name: `${E2E_PREFIX}${name}`,
      type: "PRIVATE_SIMULATION",
      purpose: "e2e test group",
      automationEnabled: opts.automationEnabled ?? false,
      requiresApproval: true,
      participantIds,
    },
  });
  if (!res.ok())
    throw new Error(`could not create temp group: ${res.status()} ${await res.text()}`);
  return (await res.json()) as { id: string; name: string };
}

export async function deleteGroup(request: APIRequestContext, id: string) {
  await request.delete(`/api/groups/${id}`);
}
