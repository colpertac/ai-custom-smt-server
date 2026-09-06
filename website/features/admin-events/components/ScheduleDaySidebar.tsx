"use client"

import { useMemo, useState } from "react"
import { CircleHelp, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EventDetailDrawer } from "@/features/admin-events/components/EventDetailDrawer"
import type { EventStatus } from "@/lib/events/types"

interface ScheduleDaySidebarProps {
  title: string
  eventIds: string[]
  events: EventStatus[]
  onRemoveEventId: (id: string) => void
  onClearAll?: () => void
  onDelete?: () => void
  onClose?: () => void
}

export function ScheduleDaySidebar({
  title,
  eventIds,
  events,
  onRemoveEventId,
  onClearAll,
  onDelete,
  onClose,
}: ScheduleDaySidebarProps) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const eventById = useMemo(() => {
    const m = new Map<string, EventStatus>()
    for (const e of events) m.set(e.id, e)
    return m
  }, [events])

  const assignedEvents = useMemo(
    () =>
      eventIds
        .map((id) => eventById.get(id))
        .filter((e): e is EventStatus => Boolean(e)),
    [eventIds, eventById]
  )

  const detailEvent = detailId
    ? (() => {
        const base = eventById.get(detailId)
        if (!base) return null
        return { ...base, active: eventIds.includes(detailId) }
      })()
    : null

  return (
    <aside className="flex w-full flex-col gap-3 rounded border border-border/70 bg-card/60 p-3 text-xs lg:sticky lg:top-4 lg:w-72 lg:shrink-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setHelpOpen(true)}
            aria-label="More details"
            title="More details"
          >
            <CircleHelp className="size-3.5 text-muted-foreground" />
          </Button>
        </div>
        <div className="flex gap-1">
          {onClose ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Done
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onDelete}
              aria-label="Delete day"
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          {assignedEvents.length} assigned
          {assignedEvents.length === 1 ? "" : "s"}
        </span>
        {assignedEvents.length > 0 && onClearAll ? (
          <button
            type="button"
            onClick={onClearAll}
            className="text-primary hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="max-h-80 overflow-y-auto rounded border border-border/60 bg-background divide-y divide-border/40">
        {assignedEvents.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-muted-foreground">
            No events yet. Toggle cards below to add them to this day.
          </p>
        ) : (
          assignedEvents.map((e) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-start gap-2.5 px-2.5 py-2 text-xs transition-colors hover:bg-muted/40"
            >
              <input
                type="checkbox"
                checked
                onChange={() => onRemoveEventId(e.id)}
                className="mt-0.5 size-3.5 shrink-0 accent-primary"
                aria-label={`Remove ${e.titleEn}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug text-foreground">
                  {e.titleEn}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                  {e.id}
                </span>
              </span>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                aria-label={`Details for ${e.titleEn}`}
                title="Details"
                onClick={(ev) => {
                  ev.preventDefault()
                  setDetailId(e.id)
                }}
              >
                <CircleHelp className="size-3.5" />
              </button>
            </label>
          ))
        )}
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md gap-4 p-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Details · {title}</DialogTitle>
            <DialogDescription>
              This sidebar lists events assigned to the selected day. Uncheck to
              remove. Use the event cards below the board to add more —
              conflicting pairs (e.g. Ordeal vs Sage) can&apos;t be enabled
              together.
            </DialogDescription>
          </DialogHeader>
          {assignedEvents.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
              {assignedEvents.map((e) => (
                <li key={e.id}>
                  <span className="font-medium text-foreground">{e.titleEn}</span>{" "}
                  <span className="font-mono text-[10px]">({e.id})</span>
                </li>
              ))}
            </ul>
          ) : null}
        </DialogContent>
      </Dialog>

      <EventDetailDrawer
        event={detailEvent}
        open={detailId != null && detailEvent != null}
        onClose={() => setDetailId(null)}
        disabled={false}
        onToggle={(id, enabled) => {
          if (!enabled) onRemoveEventId(id)
        }}
      />
    </aside>
  )
}
