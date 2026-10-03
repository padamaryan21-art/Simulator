import { existsSync, readFileSync, rmSync } from "node:fs";
import { adminClient, CRED_FILE, E2E_PREFIX, sql } from "./helpers";

/** Restores what the tests may have changed and removes the throwaway user and any leftovers. */
export default async function globalTeardown() {
  const db = sql();
  try {
    if (existsSync(CRED_FILE)) {
      const creds = JSON.parse(readFileSync(CRED_FILE, "utf8"));
      await db`update automation_state set state = ${creds.automationState} where id = 1`;
      await adminClient().auth.admin.deleteUser(creds.userId);
    }
    // Leftovers from a crashed run (sessions first: groups reference them).
    const groups = await db`select id from groups where name like ${E2E_PREFIX + "%"}`;
    const ids = groups.map((g) => g.id as string);
    if (ids.length) {
      await db`delete from conversation_sessions where group_id in ${db(ids)}`;
      await db`delete from groups where id in ${db(ids)}`;
    }
    // Test pictures: remove the stored files, then the rows (images go before the topics and
    // personas they point at).
    const imgs =
      await db`select id, storage_path from images where filename like ${E2E_PREFIX + "%"}`;
    if (imgs.length) {
      await adminClient()
        .storage.from("conversation-images")
        .remove(imgs.map((i) => i.storage_path as string));
      await db`delete from images where id in ${db(imgs.map((i) => i.id as string))}`;
    }
    await db`delete from topics where title like ${E2E_PREFIX + "%"}`;
    await db`delete from personas where name like ${E2E_PREFIX + "%"}`;
    await db`delete from prompt_templates where title like ${E2E_PREFIX + "%"}`;
    await db`delete from automation_logs where category = 'e2e'`;
  } finally {
    await db.end();
    rmSync("tests/e2e/.auth", { recursive: true, force: true });
  }
}
