"use client"

import { useState } from "react"
import Link from "next/link"
import { ImageIcon } from "lucide-react"

import {
  useAdminFeedback,
  useResolveAdminFeedback,
} from "@/features/feedback/hooks"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackImage,
  type FeedbackStatus,
} from "@/lib/feedback-constants"
import { cn } from "@/lib/utils"

function formatTs(ts: number): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString()
}

function previewBody(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim()
  if (oneLine.length <= 72) return oneLine
  return `${oneLine.slice(0, 71)}…`
}

export function AdminFeedbackPanel() {
  const [status, setStatus] = useState<FeedbackStatus>("open")
  const [selected, setSelected] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<FeedbackImage | null>(null)
  const listQuery = useAdminFeedback(status)
  const resolveMutation = useResolveAdminFeedback()

  const items = listQuery.data?.items ?? []
  const current = items.find((item) => item.id === selected) ?? null
  const loadError =
    listQuery.error instanceof Error ? listQuery.error.message : null
  const saveError =
    resolveMutation.error instanceof Error
      ? resolveMutation.error.message
      : null

  function changeStatus(next: FeedbackStatus) {
    setStatus(next)
    setSelected(null)
    setLightbox(null)
    resolveMutation.reset()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-40">
          <FieldLabel>Status</FieldLabel>
          <div className="flex gap-1">
            <button
              type="button"
              className={cn(
                "border px-2.5 py-1 text-xs font-medium",
                status === "open"
                  ? "border-gold-dim bg-primary/20"
                  : "border-border text-muted-foreground"
              )}
              onClick={() => changeStatus("open")}
            >
              Open
            </button>
            <button
              type="button"
              className={cn(
                "border px-2.5 py-1 text-xs font-medium",
                status === "closed"
                  ? "border-gold-dim bg-primary/20"
                  : "border-border text-muted-foreground"
              )}
              onClick={() => changeStatus("closed")}
            >
              Done
            </button>
          </div>
        </Field>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={listQuery.isFetching}
          onClick={() => void listQuery.refetch()}
        >
          {listQuery.isFetching ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {loadError ? <FormAlert variant="error">{loadError}</FormAlert> : null}
      {saveError ? <FormAlert variant="error">{saveError}</FormAlert> : null}
      {resolveMutation.isSuccess ? (
        <FormAlert variant="success">
          {resolveMutation.data.item.status === "closed"
            ? "Marked done"
            : "Reopened"}
        </FormAlert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="max-h-[32rem] overflow-auto border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted/80 text-[0.65rem] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-2 py-1.5 font-semibold">When</th>
                <th className="px-2 py-1.5 font-semibold">Who</th>
                <th className="px-2 py-1.5 font-semibold">Category</th>
                <th className="px-2 py-1.5 font-semibold">Note</th>
                <th className="px-2 py-1.5 font-semibold">Pics</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-2 py-6 text-center text-muted-foreground"
                  >
                    {listQuery.isLoading ? "Loading…" : "No feedback"}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      "cursor-pointer border-t border-border/60 hover:bg-muted/40",
                      selected === item.id && "bg-primary/10"
                    )}
                    onClick={() => {
                      setSelected(item.id)
                      setLightbox(null)
                      resolveMutation.reset()
                    }}
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                      {formatTs(item.createdAt)}
                    </td>
                    <td className="px-2 py-1.5">
                      {item.username ?? (
                        <span className="text-muted-foreground">Anon</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {FEEDBACK_CATEGORY_LABELS[item.category]}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {previewBody(item.body)}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {item.images.length > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="size-3.5" aria-hidden />
                          {item.images.length}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border border-border/80 bg-muted/20 px-4 py-3">
          {!current ? (
            <p className="text-sm text-muted-foreground">
              Select a submission to read the full note
              {status === "open" ? " and mark it done." : "."}
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Feedback
                </div>
                <p className="mt-1 font-medium">
                  {FEEDBACK_CATEGORY_LABELS[current.category]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTs(current.createdAt)}
                </p>
              </div>
              <div>
                <div className="text-[0.65rem] text-muted-foreground uppercase">
                  Submitted by
                </div>
                {current.username ? (
                  <Link
                    href={`/admin/accounts?u=${encodeURIComponent(current.username)}`}
                    className="text-gold-hot hover:underline"
                  >
                    {current.username}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Anonymous</span>
                )}
              </div>
              <div>
                <div className="text-[0.65rem] text-muted-foreground uppercase">
                  Description
                </div>
                <p className="mt-1 whitespace-pre-wrap">{current.body}</p>
              </div>
              {current.images.length > 0 ? (
                <div>
                  <div className="text-[0.65rem] text-muted-foreground uppercase">
                    Screenshots ({current.images.length})
                  </div>
                  <ul className="mt-1 grid grid-cols-2 gap-2">
                    {current.images.map((image, index) => (
                      <li key={image.id}>
                        <button
                          type="button"
                          className="block w-full border border-border bg-background/50 text-left"
                          onClick={() => setLightbox(image)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.url}
                            alt={`Screenshot ${index + 1}`}
                            className="max-h-48 w-full object-contain"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {current.status === "open" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate(
                        { id: current.id, status: "closed" },
                        { onSuccess: () => setSelected(null) }
                      )
                    }
                  >
                    {resolveMutation.isPending ? "Saving…" : "Mark done"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate(
                        { id: current.id, status: "open" },
                        { onSuccess: () => setSelected(null) }
                      )
                    }
                  >
                    {resolveMutation.isPending ? "Saving…" : "Reopen"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={lightbox != null}
        onOpenChange={(open) => {
          if (!open) setLightbox(null)
        }}
      >
        <DialogContent
          className="sm:max-w-3xl"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Screenshot</DialogTitle>
          </DialogHeader>
          {lightbox ? (
            <a
              href={lightbox.url}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.url}
                alt="Feedback screenshot"
                className="max-h-[70vh] w-full border border-border bg-background/50 object-contain"
              />
            </a>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
