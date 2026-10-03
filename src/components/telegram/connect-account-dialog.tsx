"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccountMutations } from "@/features/telegram/hooks";
import type { PublicTelegramAccount } from "@/server/telegram/accounts";
import { phoneSchema } from "@/validators/telegram";

type Step = "phone" | "code" | "password" | "done";

export function ConnectAccountDialog({
  account,
  onClose,
}: {
  account: PublicTelegramAccount | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(account)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {/* Keyed so each account starts fresh at the phone step. */}
        {account && <Flow key={account.id} account={account} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Flow({ account, onClose }: { account: PublicTelegramAccount; onClose: () => void }) {
  const m = useAccountMutations();
  const [step, setStep] = useState<Step>(
    account.status === "AWAITING_CODE"
      ? "code"
      : account.status === "AWAITING_PASSWORD"
        ? "password"
        : "phone",
  );
  const [phone, setPhone] = useState(account.phone ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const sendCode = () =>
    run(async () => {
      const parsed = phoneSchema.safeParse(phone);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      await m.sendCode.mutateAsync({ id: account.id, phone: parsed.data });
      setStep("code");
      toast.success("Code sent. Check the Telegram app on that account.");
    });

  const verifyCode = () =>
    run(async () => {
      const res = await m.verifyCode.mutateAsync({ id: account.id, code });
      if (res.status === "PASSWORD_REQUIRED") setStep("password");
      else finish();
    });

  const verifyPassword = () =>
    run(async () => {
      await m.verifyPassword.mutateAsync({ id: account.id, password });
      setPassword("");
      finish();
    });

  const finish = () => {
    setCode("");
    setStep("done");
    toast.success(`${account.displayName} connected`);
  };

  const cancel = async () => {
    if (step === "code" || step === "password")
      await m.cancel.mutateAsync(account.id).catch(() => undefined);
    onClose();
  };

  const busy = m.sendCode.isPending || m.verifyCode.isPending || m.verifyPassword.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect {account.displayName}</DialogTitle>
        <DialogDescription>@{account.username}</DialogDescription>
      </DialogHeader>

      {step === "phone" && (
        <div className="space-y-2">
          <Label htmlFor="phone">Phone number (international format)</Label>
          <Input
            id="phone"
            placeholder="+639171234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Telegram will send a login code to this account&apos;s Telegram app (or SMS). You must
            have access to it.
          </p>
        </div>
      )}
      {step === "code" && (
        <div className="space-y-2">
          <Label htmlFor="code">Login code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </div>
      )}
      {step === "password" && (
        <div className="space-y-2">
          <Label htmlFor="pw">Two-step verification password</Label>
          <Input
            id="pw"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            This password is sent to Telegram only and is never stored.
          </p>
        </div>
      )}
      {step === "done" && (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-5 text-green-600" /> Connected. The session is stored
          encrypted on the server.
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        {step === "done" ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="outline" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            {step === "phone" && (
              <Button onClick={sendCode} disabled={busy}>
                {busy ? "Sending…" : "Send code"}
              </Button>
            )}
            {step === "code" && (
              <Button onClick={verifyCode} disabled={busy || code.length < 4}>
                {busy ? "Verifying…" : "Verify"}
              </Button>
            )}
            {step === "password" && (
              <Button onClick={verifyPassword} disabled={busy || !password}>
                {busy ? "Verifying…" : "Verify"}
              </Button>
            )}
          </>
        )}
      </DialogFooter>
    </>
  );
}
