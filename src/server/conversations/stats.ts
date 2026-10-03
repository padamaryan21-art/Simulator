import { sql } from "drizzle-orm";
import { db } from "@/db";
import { localDate, zonedTime } from "@/lib/scheduling/time";

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;

const TZ = "Asia/Manila";

type Row = {
  connected_accounts: number;
  total_accounts: number;
  active_simulations: number;
  pending_approval: number;
  scheduled: number;
  todays_conversations: number;
  messages_sent: number;
  failed: number;
  state: "STOPPED" | "RUNNING" | "PAUSED" | null;
};

/**
 * All dashboard numbers in ONE round trip. (The first version ran nine queries in parallel per
 * page load, which on a small shared connection pool starved every other process.)
 */
export async function getDashboardStats() {
  const startOfDay = zonedTime(localDate(TZ, new Date()), 0, TZ);

  const res = (await db.execute(sql`
    select
      (select count(*)::int from telegram_accounts where status = 'CONNECTED') as connected_accounts,
      (select count(*)::int from telegram_accounts) as total_accounts,
      -- conversations being sent right now
      (select count(*)::int from conversation_sessions where status = 'SENDING') as active_simulations,
      -- messages a person still has to review: only in manual conversations that await approval
      -- (preview drafts, e.g. from bulk generation, are not waiting for anyone)
      (select count(*)::int from conversation_messages m
         join conversation_sessions s on s.id = m.session_id
         where s.mode = 'MANUAL' and s.status = 'PENDING_APPROVAL'
           and m.status in ('GENERATED', 'EDITED')) as pending_approval,
      -- conversations the scheduler has planned but not finished starting
      (select count(*)::int from scheduled_runs where status in ('PENDING', 'QUEUED')) as scheduled,
      -- conversations that actually started today (Philippine day)
      (select count(*)::int from conversation_sessions where started_at >= ${startOfDay.toISOString()}::timestamptz) as todays_conversations,
      (select count(*)::int from conversation_messages where status = 'SENT' and sent_at >= ${startOfDay.toISOString()}::timestamptz) as messages_sent,
      (select count(*)::int from conversation_messages where status = 'FAILED') as failed,
      (select state from automation_state where id = 1) as state
  `)) as unknown as Row[];
  const r = res[0];

  return {
    connectedAccounts: r.connected_accounts,
    totalAccounts: r.total_accounts,
    activeSimulations: r.active_simulations,
    pendingApproval: r.pending_approval,
    scheduled: r.scheduled,
    todaysConversations: r.todays_conversations,
    messagesSent: r.messages_sent,
    failed: r.failed,
    automation: r.state ?? "STOPPED",
    claudeConfigured: Boolean(
      process.env.GROQ_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.CEREBRAS_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.MISTRAL_API_KEY ||
      process.env.OPENAI_API_KEY ||
      (process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_MODEL),
    ),
    telegramConfigured: Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH),
  };
}
