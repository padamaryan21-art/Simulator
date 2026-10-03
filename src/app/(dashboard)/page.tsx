import { AutomationControls } from "@/components/dashboard/automation-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardStats } from "@/server/conversations/stats";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-semibold">{value}</CardContent>
    </Card>
  );
}

function Status({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return <Badge variant={ok ? "default" : "destructive"}>{ok ? okText : badText}</Badge>;
}

export default async function DashboardPage() {
  const s = await getDashboardStats();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      </div>
      <AutomationControls />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Connected Accounts" value={`${s.connectedAccounts} / ${s.totalAccounts}`} />
        <Stat label="Active Simulations" value={s.activeSimulations} />
        <Stat label="Pending Approval" value={s.pendingApproval} />
        <Stat label="Scheduled" value={s.scheduled} />
        <Stat label="Today's Conversations" value={s.todaysConversations} />
        <Stat label="Messages Sent Today" value={s.messagesSent} />
        <Stat label="Failed" value={s.failed} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Services</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              AI models
              <Status ok={s.claudeConfigured} okText="Configured" badText="Not configured" />
            </div>
            <div className="flex items-center justify-between text-sm">
              Telegram
              <Status
                ok={s.telegramConfigured && s.connectedAccounts > 0}
                okText="Connected"
                badText={s.telegramConfigured ? "No accounts" : "Not configured"}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
