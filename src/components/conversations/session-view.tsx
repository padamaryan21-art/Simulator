"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Pencil,
  RefreshCw,
  RotateCcw,
  SkipForward,
  ImageOff,
  ImagePlus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSession, useSessionActions, type SessionMessage } from "@/features/conversations/hooks";
import { imageFileUrl, useImages } from "@/features/images/hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { STATUS_VARIANT } from "./simulator";

const COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-fuchsia-500",
];
const colorFor = (name: string) =>
  COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const MSG_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  GENERATED: { label: "Needs review", variant: "outline" },
  EDITED: { label: "Edited · needs approval", variant: "outline" },
  APPROVED: { label: "Approved", variant: "default" },
  SKIPPED: { label: "Skipped", variant: "secondary" },
  SCHEDULED: { label: "Scheduled", variant: "outline" },
  SENT: { label: "Sent", variant: "default" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

export function SessionView({ id }: { id: string }) {
  const { data, isLoading, error } = useSession(id);
  const act = useSessionActions(id);
  const [attachFor, setAttachFor] = useState<SessionMessage | null>(null);

  const run = async (p: Promise<unknown>, ok?: string) => {
    try {
      await p;
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !data)
    return <p className="text-sm text-destructive">{(error as Error)?.message ?? "Not found"}</p>;

  const { session, group, messages, topicTitle } = data;
  const real = session.environment === "REAL_COMMUNITY";
  const editable = session.status === "DRAFT" || session.status === "PENDING_APPROVAL";
  const preview = session.mode === "PREVIEW";
  const approvable = messages.filter((m) => m.status === "GENERATED" || m.status === "EDITED");
  const approved = messages.filter((m) => m.status === "APPROVED");
  const sentCount = messages.filter((m) => m.status === "SENT").length;

  const send = () => {
    const warning = real
      ? `Send ${approved.length} approved message(s) to the REAL community "${group.name}"?\n\nThey will be posted publicly from the personas' Telegram accounts.`
      : `Send ${approved.length} approved message(s) to "${group.name}"?`;
    if (confirm(warning)) run(act.send.mutateAsync(), "Sending started");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/ai/simulator"
        className="inline-flex items-center text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="mr-1 size-3.5" /> Simulator
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{topicTitle ?? "Free conversation"}</h1>
          <p className="text-sm text-muted-foreground">{group.name}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{session.mode}</Badge>
          <Badge variant={STATUS_VARIANT[session.status]}>{session.status.replace("_", " ")}</Badge>
        </div>
      </div>

      {real && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>⚠ REAL COMMUNITY</AlertTitle>
          <AlertDescription>Human approval required before sending.</AlertDescription>
        </Alert>
      )}

      {preview && editable && (
        <Alert>
          <AlertTitle>Preview only</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Nothing will be sent. Edit and regenerate freely; enable sending when you are happy with
            it.
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(act.enableSending.mutateAsync())}
            >
              Enable sending
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3 bg-muted/30 p-4">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              m={m}
              editable={editable}
              preview={preview}
              busy={
                act.regenerate.isPending || act.editMessage.isPending || act.deleteMessage.isPending
              }
              regenerating={act.regenerate.isPending && act.regenerate.variables === m.id}
              onSave={(content) => run(act.editMessage.mutateAsync({ id: m.id, content }))}
              onRegenerate={() => run(act.regenerate.mutateAsync(m.id))}
              onDelete={() => run(act.deleteMessage.mutateAsync(m.id))}
              onApprove={() => run(act.approve.mutateAsync([m.id]))}
              onSkip={() => run(act.editMessage.mutateAsync({ id: m.id, action: "skip" }))}
              onRestore={() => run(act.editMessage.mutateAsync({ id: m.id, action: "restore" }))}
              onAttachImage={() => setAttachFor(m)}
              onRemoveImage={() => run(act.editMessage.mutateAsync({ id: m.id, imageId: null }))}
            />
          ))}
          {!messages.length && <p className="text-sm text-muted-foreground">No messages.</p>}
        </CardContent>
      </Card>

      <AttachImageDialog
        message={attachFor}
        onClose={() => setAttachFor(null)}
        onPick={(imageId) => {
          if (!attachFor) return;
          run(act.editMessage.mutateAsync({ id: attachFor.id, imageId }), "Picture attached");
          setAttachFor(null);
        }}
      />

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3 shadow">
        <span className="text-sm text-muted-foreground">
          {approved.length} approved · {approvable.length} awaiting review · {sentCount} sent
        </span>
        <div className="flex gap-2">
          {session.status === "SENDING" && (
            <Button
              variant="destructive"
              onClick={() => run(act.cancel.mutateAsync(), "Cancelled")}
            >
              Cancel sending
            </Button>
          )}
          {editable && !preview && (
            <>
              <Button
                variant="outline"
                disabled={!approvable.length || act.approve.isPending}
                onClick={() => run(act.approve.mutateAsync(undefined), "Approved")}
              >
                <Check className="mr-1 size-4" /> Approve all ({approvable.length})
              </Button>
              <Button disabled={!approved.length || act.send.isPending} onClick={send}>
                Send approved ({approved.length})
              </Button>
              <Button variant="ghost" onClick={() => run(act.cancel.mutateAsync(), "Cancelled")}>
                Discard
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  m,
  editable,
  preview,
  busy,
  regenerating,
  onSave,
  onRegenerate,
  onDelete,
  onApprove,
  onSkip,
  onRestore,
  onAttachImage,
  onRemoveImage,
}: {
  m: SessionMessage;
  editable: boolean;
  preview: boolean;
  busy: boolean;
  regenerating: boolean;
  onSave: (content: string) => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onSkip: () => void;
  onRestore: () => void;
  onAttachImage: () => void;
  onRemoveImage: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const canAct = editable && m.status !== "SENT";
  const badge = MSG_BADGE[m.status];
  const skipped = m.status === "SKIPPED";

  return (
    <div className="flex items-start gap-2">
      <Avatar className="size-9">
        <AvatarFallback className={cn("text-xs text-white", colorFor(m.personaName))}>
          {initials(m.personaName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 max-w-[85%] space-y-1">
        <div
          className={cn(
            "rounded-2xl rounded-tl-sm border bg-background px-3 py-2 shadow-sm",
            skipped && "opacity-50",
          )}
        >
          <p
            className={cn("text-sm font-semibold", colorFor(m.personaName).replace("bg-", "text-"))}
          >
            {m.personaName}
          </p>
          {m.imageId && (
            // eslint-disable-next-line @next/next/no-img-element -- private signed-in-only route
            <img
              src={imageFileUrl(m.imageId)}
              alt="Attached picture"
              loading="lazy"
              className="my-1.5 max-h-56 w-auto max-w-full rounded-lg border"
            />
          )}
          {editing ? (
            <div className="mt-1 space-y-2">
              <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={() => {
                    onSave(draft);
                    setEditing(false);
                  }}
                  disabled={!draft.trim()}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(m.content);
                    setEditing(false);
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ) : (
            !(m.imageId && m.content.trim() === "📷") && (
              <p className={cn("whitespace-pre-wrap text-sm", skipped && "line-through")}>
                {regenerating ? "Regenerating…" : m.content}
              </p>
            )
          )}
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {new Date(m.sentAt ?? m.generatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {m.errorMessage && <span className="text-xs text-destructive">{m.errorMessage}</span>}
          {canAct && !editing && (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Edit"
                onClick={() => {
                  setDraft(m.content);
                  setEditing(true);
                }}
                disabled={busy}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Regenerate"
                onClick={onRegenerate}
                disabled={busy}
              >
                <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
              </Button>
              {!preview && (m.status === "GENERATED" || m.status === "EDITED") && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Approve"
                  onClick={onApprove}
                  disabled={busy}
                >
                  <Check className="size-3.5" />
                </Button>
              )}
              {skipped ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Restore"
                  onClick={onRestore}
                  disabled={busy}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Skip"
                  onClick={onSkip}
                  disabled={busy}
                >
                  <SkipForward className="size-3.5" />
                </Button>
              )}
              {m.imageId ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove image"
                  onClick={onRemoveImage}
                  disabled={busy}
                >
                  <ImageOff className="size-3.5" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Attach image"
                  onClick={onAttachImage}
                  disabled={busy}
                >
                  <ImagePlus className="size-3.5" />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete"
                onClick={onDelete}
                disabled={busy}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Picks an unused library picture that this message's persona is allowed to send. */
function AttachImageDialog({
  message,
  onClose,
  onPick,
}: {
  message: SessionMessage | null;
  onClose: () => void;
  onPick: (imageId: string) => void;
}) {
  const { data } = useImages({ status: "AVAILABLE" });
  const mine = (data ?? []).filter((i) => !i.personaId || i.personaId === message?.personaId);
  return (
    <Dialog open={Boolean(message)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attach a picture</DialogTitle>
          <DialogDescription>
            Unused pictures that {message?.personaName ?? "this persona"} can send. Attaching one
            means the message must be approved again.
          </DialogDescription>
        </DialogHeader>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No unused pictures for this persona. Upload some on the Images page.
          </p>
        ) : (
          <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {mine.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => onPick(i.id)}
                className="space-y-1 rounded-md border p-1.5 text-left hover:bg-accent"
                aria-label={`Attach ${i.filename}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private signed-in-only route */}
                <img
                  src={imageFileUrl(i.id)}
                  alt={i.caption || i.filename}
                  loading="lazy"
                  className="aspect-video w-full rounded object-cover"
                />
                <p className="truncate text-xs">{i.caption || i.filename}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {i.topicTitle ?? "no topic"}
                </p>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
