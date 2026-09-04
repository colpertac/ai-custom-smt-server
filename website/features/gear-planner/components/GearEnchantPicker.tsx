"use client"

import { useEffect, useState } from "react"

import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  GEAR_ENCHANT_MIME,
  PLANNER_STATS,
  rankEnchantsForStat,
  type EnchantSide,
  type GearEnchantDragPayload,
  type PlannerAttrs,
  type PlannerLnc,
  type PlannerStatKey,
  type RankedEnchantHit,
} from "@/lib/gear-planner-combat"
import { cn } from "@/lib/utils"

function DraggableEnchantRow({
  hit,
  onApply,
}: {
  hit: RankedEnchantHit
  onApply: (enchantId: number, side: EnchantSide) => void
}) {
  return (
    <li
      className="cursor-grab border-t border-border/60 px-2 py-1.5 hover:bg-muted/30 active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        const payload: GearEnchantDragPayload = {
          enchantId: hit.enchant.id,
          side: hit.side,
        }
        e.dataTransfer.setData(GEAR_ENCHANT_MIME, JSON.stringify(payload))
        e.dataTransfer.setData("text/plain", `${hit.enchant.id}:${hit.side}`)
        e.dataTransfer.effectAllowed = "copy"
      }}
      onDoubleClick={() => onApply(hit.enchant.id, hit.side)}
      title="Drag onto sidebar T/S card or double-click to apply"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-[#c9a0ff]">
          {hit.effectName}
        </p>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px]",
            hit.contribution === 0
              ? "text-muted-foreground"
              : hit.contribution > 0
                ? "text-gold-hot"
                : "text-sky-300"
          )}
        >
          {hit.contribution === 0
            ? "—"
            : hit.contribution > 0
              ? `+${hit.contribution}`
              : String(hit.contribution)}
        </span>
      </div>
      <p className="truncate text-[10px] text-muted-foreground">
        {hit.sourceName} · #{hit.enchant.id}
      </p>
      {hit.lines[0] ? (
        <p className="truncate text-[10px] text-foreground/80">{hit.lines[0]}</p>
      ) : null}
    </li>
  )
}

export function GearEnchantPicker({
  stat,
  attrs,
  lnc,
  enabled,
  onApply,
}: {
  stat: PlannerStatKey
  attrs: PlannerAttrs
  lnc: PlannerLnc
  enabled: boolean
  onApply: (enchantId: number, side: EnchantSide) => void
}) {
  const [side, setSide] = useState<EnchantSide>("tarot")
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<RankedEnchantHit[]>([])

  useEffect(() => {
    if (!enabled) {
      setHits([])
      return
    }
    const handle = window.setTimeout(() => {
      setHits(
        rankEnchantsForStat({
          stat,
          side,
          attrs,
          lnc,
          limit: 25,
          query: q,
        })
      )
    }, q.trim() ? 150 : 0)
    return () => window.clearTimeout(handle)
  }, [stat, side, attrs, lnc, q, enabled])

  const def = PLANNER_STATS.find((s) => s.key === stat)!

  return (
    <div className="space-y-2 border border-border bg-card/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-sm tracking-[0.14em] text-gold-dim uppercase">
          Tarot / Soul
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            className={cn(
              "px-2 py-0.5 text-[11px] uppercase tracking-wider",
              side === "tarot"
                ? "bg-violet-500/20 text-violet-300"
                : "text-muted-foreground hover:text-violet-300"
            )}
            onClick={() => setSide("tarot")}
          >
            Tarot
          </button>
          <button
            type="button"
            className={cn(
              "px-2 py-0.5 text-[11px] uppercase tracking-wider",
              side === "soul"
                ? "bg-orange-500/20 text-orange-300"
                : "text-muted-foreground hover:text-orange-300"
            )}
            onClick={() => setSide("soul")}
          >
            Soul
          </button>
        </div>
      </div>
      {!enabled ? (
        <p className="text-xs text-muted-foreground">
          Open a slot with an S1 piece to apply fusions.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            Ranked for {def.label} under current attrs / LNC. Drag onto the
            matching sidebar card or double-click.
          </p>
          <Field>
            <FieldLabel htmlFor="gp-enchant-q">Search</FieldLabel>
            <Input
              id="gp-enchant-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Effect, crystal, or ID…"
              className="h-8 text-xs"
            />
          </Field>
          {hits.length === 0 ? (
            <p className="text-xs text-muted-foreground">No matching fusions.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto border border-border">
              {hits.map((hit) => (
                <DraggableEnchantRow
                  key={`${hit.side}-${hit.enchant.id}`}
                  hit={hit}
                  onApply={onApply}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
