"use client"

import { useCallback, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { GripVertical, Loader2, ListOrdered, WandSparkles, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { PLANNER_STATS, type CombatFocus, type PlannerStatKey } from "@/lib/gear-planner-combat"
import {
  cloneLoadout,
  DEFAULT_OPTIMIZE_PRIORITIES,
  HARD_CAP_STATS,
  OPTIMIZE_PRIORITY_STATS,
  optimizeGearLoadout,
  type OptimizeBudget,
  type OptimizeProgress,
  type OptimizeResult,
} from "@/lib/gear-planner-optimize"
import type {
  PlannerAttrs,
  PlannerLnc,
  PlannerSlot,
} from "@/lib/gear-planner-combat"
import { cn } from "@/lib/utils"

function formatSoft(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "")
}

function statLabel(key: PlannerStatKey): string {
  return PLANNER_STATS.find((s) => s.key === key)?.label ?? key
}

function statAbbr(key: PlannerStatKey): string {
  return PLANNER_STATS.find((s) => s.key === key)?.abbr ?? key
}

function summarizeResult(result: OptimizeResult): string {
  const closed = HARD_CAP_STATS.filter(
    (k) => !result.before.atCap[k] && result.after.atCap[k]
  ).map((k) => k.toUpperCase())
  const parts: string[] = []
  if (result.changes.length === 0) {
    if (result.after.hardDeficit > 0) {
      parts.push(
        `No changes found in time (hard deficit still ${formatSoft(result.after.hardDeficit)}). Try Normal budget or unlock S1.`
      )
    } else {
      parts.push("No changes — current loadout already best within budget.")
    }
  } else {
    parts.push(`Applied ${result.changes.length} layer change(s).`)
  }
  if (closed.length > 0) {
    parts.push(`Closed caps: ${closed.join(", ")}.`)
  } else if (result.after.hardDeficit < result.before.hardDeficit) {
    parts.push(
      `Hard deficit ${formatSoft(result.before.hardDeficit)} → ${formatSoft(result.after.hardDeficit)}.`
    )
  }
  const softDelta = result.after.soft - result.before.soft
  if (Math.abs(softDelta) >= 0.05) {
    parts.push(
      `Soft ${softDelta >= 0 ? "+" : ""}${formatSoft(softDelta)} (by your priority order).`
    )
  }
  if (result.changes[0]?.note) {
    parts.push(result.changes.slice(0, 3).map((c) => c.note).join(" · "))
  }
  return parts.join(" ")
}

function PriorityListEditor({
  priorities,
  onChange,
}: {
  priorities: PlannerStatKey[]
  onChange: (next: PlannerStatKey[]) => void
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= priorities.length || from === to) return
    const next = [...priorities]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    onChange(next)
  }

  const toggle = (key: PlannerStatKey) => {
    if (priorities.includes(key)) {
      if (priorities.length <= 1) return
      onChange(priorities.filter((k) => k !== key))
    } else {
      onChange([...priorities, key])
    }
  }

  const inactive = OPTIMIZE_PRIORITY_STATS.filter((k) => !priorities.includes(k))

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Drag to reorder. Higher = more important after hard caps (LBC/TAC/PC/PP
        100%, CD ≤5, Incant ≤0) are filled.
      </p>
      <ol className="space-y-1">
        {priorities.map((key, index) => (
          <li
            key={key}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex == null) return
              move(dragIndex, index)
              setDragIndex(null)
            }}
            onDragEnd={() => setDragIndex(null)}
            className={cn(
              "flex cursor-grab items-center gap-2 rounded-xs border border-border/80 bg-card/60 px-2 py-1.5 active:cursor-grabbing",
              dragIndex === index && "border-gold/50 opacity-70"
            )}
          >
            <GripVertical
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="font-mono text-[10px] text-gold-dim">
              #{index + 1}
            </span>
            <span className="min-w-0 flex-1 text-xs">
              <span className="font-semibold">{statAbbr(key)}</span>
              <span className="text-muted-foreground"> · {statLabel(key)}</span>
            </span>
            <div className="flex gap-0.5">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                aria-label="Move up"
              >
                ↑
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={index === priorities.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label="Move down"
              >
                ↓
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={priorities.length <= 1}
                onClick={() => toggle(key)}
                aria-label="Remove"
              >
                ✕
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {inactive.length > 0 ? (
        <div className="space-y-1">
          <div className="text-[10px] tracking-wider text-muted-foreground uppercase">
            Add soft goal
          </div>
          <div className="flex flex-wrap gap-1">
            {inactive.map((key) => (
              <Button
                key={key}
                type="button"
                size="xs"
                variant="outline"
                onClick={() => toggle(key)}
              >
                + {statAbbr(key)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function GearSuggestPanel({
  loadout,
  attrs,
  lnc,
  gender,
  focus = "player",
  onApply,
}: {
  loadout: PlannerSlot[]
  attrs: PlannerAttrs
  lnc: PlannerLnc
  gender: 0 | 1
  focus?: CombatFocus
  onApply: (next: PlannerSlot[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [budget, setBudget] = useState<OptimizeBudget>("normal")
  const [lockS1, setLockS1] = useState(false)
  const [priorities, setPriorities] = useState<PlannerStatKey[]>([
    ...DEFAULT_OPTIMIZE_PRIORITIES,
  ])
  const [draftPriorities, setDraftPriorities] = useState<PlannerStatKey[]>([
    ...DEFAULT_OPTIMIZE_PRIORITIES,
  ])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<OptimizeProgress | null>(null)
  const [lastResult, setLastResult] = useState<OptimizeResult | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<PlannerSlot[] | null>(null)
  const cancelRef = useRef({ cancelled: false })

  const runSuggest = useCallback(async () => {
    if (running) return
    cancelRef.current = { cancelled: false }
    setRunning(true)
    setProgress(null)
    setLastResult(null)
    const snapshot = cloneLoadout(loadout)
    // Let React paint the full-screen overlay before the sync warm/search work.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
    try {
      const result = await optimizeGearLoadout({
        loadout,
        attrs,
        lnc,
        gender,
        priorities,
        lockS1,
        focus,
        budget,
        signal: cancelRef.current,
        onProgress: setProgress,
      })
      setLastResult(result)
      setUndoSnapshot(snapshot)
      onApply(result.loadout)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }, [
    running,
    loadout,
    attrs,
    lnc,
    gender,
    priorities,
    lockS1,
    focus,
    budget,
    onApply,
  ])

  const cancel = useCallback(() => {
    cancelRef.current.cancelled = true
  }, [])

  const undo = useCallback(() => {
    if (!undoSnapshot) return
    onApply(undoSnapshot)
    setUndoSnapshot(null)
    setLastResult(null)
  }, [undoSnapshot, onApply])

  return (
    <div className="space-y-2">
      {running && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 supports-backdrop-filter:backdrop-blur-sm"
              role="alertdialog"
              aria-busy="true"
              aria-live="polite"
              aria-label="Suggesting gear loadout"
            >
              <div className="mx-4 w-full max-w-sm space-y-4 border border-border bg-muted/95 p-6 text-center shadow-lg">
                <Loader2
                  className="mx-auto size-8 animate-spin text-gold"
                  aria-hidden
                />
                <div className="space-y-1">
                  <h2 className="font-heading text-lg tracking-[0.12em] text-gold-dim uppercase">
                    Searching…
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Drafting a loadout against hard caps and your soft
                    priorities. Review and edit after — this is a suggestion,
                    not a final build. The page may pause briefly.
                  </p>
                </div>
                {progress ? (
                  <p className="font-mono text-[11px] text-foreground/80">
                    {progress.phase} · {progress.evaluations} evals ·{" "}
                    {(progress.elapsedMs / 1000).toFixed(1)}s
                    <br />
                    deficit {formatSoft(progress.bestHardDeficit)} · soft{" "}
                    {formatSoft(progress.bestSoft)}
                  </p>
                ) : (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Preparing search…
                  </p>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={cancel}
                >
                  Stop & apply best
                </Button>
              </div>
            </div>,
            document.body
          )
        : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          className={cn(open && "border-gold/60 bg-gold/10 text-gold-hot")}
          onClick={() => setOpen((v) => !v)}
        >
          <WandSparkles className="size-3.5" aria-hidden />
          Suggest
        </Button>
        {undoSnapshot ? (
          <Button type="button" size="xs" variant="ghost" onClick={undo}>
            <Undo2 className="size-3.5" aria-hidden />
            Undo suggest
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-2.5 rounded-xs border border-border/80 bg-card/50 p-3 text-xs">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Budget
              </span>
              <div className="flex border border-border p-0.5">
                {(
                  [
                    ["quick", "Quick (~2s)"],
                    ["normal", "Normal (~4s)"],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    size="xs"
                    variant={budget === key ? "default" : "ghost"}
                    disabled={running}
                    onClick={() => setBudget(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 pb-1 text-muted-foreground">
              <Switch
                size="sm"
                checked={lockS1}
                disabled={running}
                onCheckedChange={setLockS1}
              />
              <span title="Keep appearance / set bases; only swap S2, S3, Tarot, Soul">
                Lock current S1
              </span>
            </label>

            <Dialog
              open={priorityOpen}
              onOpenChange={(next) => {
                setPriorityOpen(next)
                if (next) setDraftPriorities([...priorities])
              }}
            >
              <DialogTrigger
                type="button"
                disabled={running}
                className="inline-flex items-center gap-1.5 rounded-xs border border-border/80 bg-muted/30 px-2 py-1 text-xs font-medium transition-all hover:border-gold-dim hover:bg-gold/10 hover:text-gold-hot"
              >
                <ListOrdered className="size-3.5" aria-hidden />
                Stat priorities
              </DialogTrigger>
              <DialogContent className="max-w-md sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-heading text-base tracking-[0.08em] text-gold-dim uppercase">
                    Soft goal priorities
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Hard caps always come first. This list only ranks what to
                    maximize afterward (LBC overcap, Crit, FCC, TAP, …).
                  </DialogDescription>
                </DialogHeader>
                <PriorityListEditor
                  priorities={draftPriorities}
                  onChange={setDraftPriorities}
                />
                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraftPriorities([...DEFAULT_OPTIMIZE_PRIORITIES])
                    }
                  >
                    Reset default
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setPriorities([...draftPriorities])
                      setPriorityOpen(false)
                    }}
                  >
                    Save priorities
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Soft order:{" "}
            <span className="font-mono text-foreground">
              {priorities.map(statAbbr).join(" → ")}
            </span>
          </p>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Hits hard caps first, then soft-maximizes by your priority order.
            Multi-seed search can replace S1 bases unless locked.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={running}
              onClick={() => void runSuggest()}
            >
              {running ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Searching…
                </>
              ) : (
                <>
                  <WandSparkles className="size-3.5" aria-hidden />
                  Run suggest
                </>
              )}
            </Button>
            {running ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancel}
              >
                Stop & apply best
              </Button>
            ) : null}
            {progress ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {progress.phase} · {progress.evaluations} evals ·{" "}
                {(progress.elapsedMs / 1000).toFixed(1)}s · deficit{" "}
                {formatSoft(progress.bestHardDeficit)} · soft{" "}
                {formatSoft(progress.bestSoft)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {lastResult ? (
        <div className="rounded-xs border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-[11px] leading-relaxed text-foreground/90">
          <div className="mb-0.5 font-heading text-[10px] tracking-wider text-emerald-400/90 uppercase">
            Suggestion
            {lastResult.cancelled ? " (stopped early)" : ""}
          </div>
          <p>{summarizeResult(lastResult)}</p>
        </div>
      ) : null}
    </div>
  )
}
