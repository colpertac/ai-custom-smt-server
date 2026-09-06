"use client"

import { useState } from "react"
import { ArrowDown, GripVertical, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EventScheduleLoopDay } from "@/lib/events/types"

interface LoopDayBoardProps {
  days: EventScheduleLoopDay[]
  selectedId: string | null
  /** 0-based index of the loop day active right now (after flip). */
  activeIndex: number | null
  titleByEventId: Map<string, string>
  onSelect: (id: string) => void
  onAdd: () => void
  onReorder: (days: EventScheduleLoopDay[]) => void
}

export function LoopDayBoard({
  days,
  selectedId,
  activeIndex,
  titleByEventId,
  onSelect,
  onAdd,
  onReorder,
}: LoopDayBoardProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= days.length || from === to) return
    const next = [...days]
    const [item] = next.splice(from, 1)
    if (!item) return
    next.splice(to, 0, item)
    onReorder(next)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">
        Drag day cards to reorder the loop sequence.
        {activeIndex != null && days.length > 0 ? (
          <>
            {" "}
            Arrow marks Day {activeIndex + 1} — active now (after today’s flip).
          </>
        ) : null}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day, idx) => {
          const selected = day.id === selectedId
          const active = activeIndex === idx
          const names = day.eventIds.map((id) => titleByEventId.get(id) || id)
          const dragging = dragIndex === idx
          const dropTarget =
            overIndex === idx && dragIndex != null && dragIndex !== idx
          return (
            <div key={day.id} className="flex w-36 shrink-0 flex-col gap-1">
              <div
                className={cn(
                  "flex h-7 items-end justify-center",
                  active ? "text-primary" : "text-transparent"
                )}
                aria-hidden={!active}
              >
                {active ? (
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-[10px] font-semibold uppercase tracking-wide">
                      Now
                    </span>
                    <ArrowDown className="size-4 animate-bounce" strokeWidth={2.5} />
                  </span>
                ) : (
                  <span className="h-7" />
                )}
              </div>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  setDragIndex(idx)
                  e.dataTransfer.effectAllowed = "move"
                  // Avoid Firefox requiring setData for drag to work.
                  e.dataTransfer.setData("text/plain", day.id)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                  if (overIndex !== idx) setOverIndex(idx)
                }}
                onDragLeave={() => {
                  if (overIndex === idx) setOverIndex(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex == null) return
                  move(dragIndex, idx)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onClick={() => onSelect(day.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-36 w-full cursor-grab flex-col rounded border bg-muted/20 p-2.5 text-left transition-colors active:cursor-grabbing",
                  selected
                    ? "border-primary/70 bg-primary/10 ring-1 ring-primary/40"
                    : "border-border/60 hover:border-border hover:bg-muted/40",
                  active &&
                    !selected &&
                    "border-primary/50 bg-primary/5 ring-1 ring-primary/25",
                  dragging && "opacity-50",
                  dropTarget && "border-primary ring-1 ring-primary/50"
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold text-foreground">
                    Day {idx + 1}
                    {active ? (
                      <span className="ml-1 text-[10px] font-medium text-primary">
                        · live
                      </span>
                    ) : null}
                  </span>
                  <GripVertical
                    className="size-3.5 shrink-0 text-muted-foreground/70"
                    aria-hidden
                  />
                </span>
                <ul className="mt-2 flex-1 space-y-0.5 overflow-hidden text-[11px] text-muted-foreground">
                  {names.length === 0 ? (
                    <li className="italic opacity-70">(no events)</li>
                  ) : (
                    names.slice(0, 6).map((n) => (
                      <li key={n} className="truncate">
                        · {n}
                      </li>
                    ))
                  )}
                  {names.length > 6 ? (
                    <li className="opacity-60">+{names.length - 6} more</li>
                  ) : null}
                </ul>
              </button>
            </div>
          )
        })}
        <div className="flex w-36 shrink-0 flex-col gap-1">
          <div className="h-7" aria-hidden />
          <Button
            type="button"
            variant="outline"
            onClick={onAdd}
            className="flex size-36 shrink-0 flex-col items-center justify-center gap-1 border-dashed"
            aria-label="Add day"
          >
            <Plus className="size-6" />
            <span className="text-[11px]">Add day</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
