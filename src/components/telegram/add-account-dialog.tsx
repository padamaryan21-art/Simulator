"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { createAccountSchema, type CreateAccountInput } from "@/validators/telegram";

export function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  const { create } = useAccountMutations();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAccountInput>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: { phone: undefined, proxyUrl: undefined },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync({ ...values, phone: values.phone || undefined, proxyUrl: values.proxyUrl || null });
      toast.success("Account added. Click Connect to log it in.");
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add account");
    }
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 size-4" /> Add account
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Add Telegram account</DialogTitle>
              <DialogDescription>
                You&apos;ll log it in with a phone code in the next step.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" {...register("displayName")} />
              {errors.displayName && (
                <p className="text-sm text-destructive">{errors.displayName.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Telegram username</Label>
              <Input id="username" placeholder="@username" {...register("username")} />
              {errors.username && (
                <p className="text-sm text-destructive">{errors.username.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" placeholder="+639171234567" {...register("phone")} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proxyUrl">Proxy (optional)</Label>
              <Input
                id="proxyUrl"
                placeholder="socks5://user:pass@host:1080"
                {...register("proxyUrl")}
              />
              {errors.proxyUrl && (
                <p className="text-sm text-destructive">{errors.proxyUrl.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                SOCKS5 proxy for this account&apos;s Telegram connection.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
