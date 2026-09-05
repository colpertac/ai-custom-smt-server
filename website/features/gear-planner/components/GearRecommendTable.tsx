"use client"

import { Layers, Loader2, Sparkles } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

import type { WikiItem, WikiItemStat } from "@/content/wiki/types"
import { formatWikiStatValue } from "@/content/wiki/format"
import { WikiGenderBadge } from "@/features/wiki/components/WikiGenderBadge"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { EQUIP_SLOTS, type EquipSlotKey } from "@/lib/armory-equipment"
import {
  GEAR_LAYER_MIME,
  PLANNER_STATS,
  type GearLayer,
  type GearLayerDragPayload,
  type PlannerStatKey,
} from "@/lib/gear-planner-combat"
import { cn } from "@/lib/utils"

export type RecommendHit = {
  id: number
  name: string
  iconSrc: string | null
  equipSlot: string
  slotKey: EquipSlotKey
  level: number
  gender?: number
  genderLabel?: string
  pieceContribution: number
  setCompletionBonus: number
  score: number
  completesSetIds: number[]
  setBonus: string[]
  basicFeatures: WikiItemStat[]
  characteristics: WikiItemStat[]
}

const LAYER_CONFIG = {
  s1: {
    tag: "S1",
    label: "Set / SItem",
    border: "border-sky-500/40 hover:border-sky-400",
    bg: "bg-sky-950/20 hover:bg-sky-950/35",
    badge: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    glow: "hover:shadow-[0_0_10px_rgba(56,189,248,0.22)]",
    emptyLabel: "No S1",
  },
  s2: {
    tag: "S2",
    label: "Basic",
    border: "border-emerald-500/40 hover:border-emerald-400",
    bg: "bg-emerald-950/20 hover:bg-emerald-950/35",
    badge: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    glow: "hover:shadow-[0_0_10px_rgba(52,211,153,0.22)]",
    emptyLabel: "No S2",
  },
  s3: {
    tag: "S3",
    label: "Char",
    border: "border-rose-500/40 hover:border-rose-400",
    bg: "bg-rose-950/20 hover:bg-rose-950/35",
    badge: "text-rose-400 border-rose-500/30 bg-rose-500/10",
    glow: "hover:shadow-[0_0_10px_rgba(251,113,133,0.22)]",
    emptyLabel: "No S3",
  },
} as const

function DraggableLayerCell({
  hit,
  layer,
  lines,
  stats,
  onApplyLayer,
}: {
  hit: RecommendHit
  layer: GearLayer
  lines?: string[]
  stats?: WikiItemStat[]
  onApplyLayer?: (hit: RecommendHit, layer: GearLayer) => void
}) {
  const [justApplied, setJustApplied] = useState(false)
  const cfg = LAYER_CONFIG[layer]
  const hasContent = Boolean(
    (stats && stats.length > 0) || (lines && lines.length > 0)
  )

  const handleDoubleClick = () => {
    setJustApplied(true)
    window.setTimeout(() => setJustApplied(false), 800)
    onApplyLayer?.(hit, layer)
  }

  if (!hasContent) {
    return (
      <td className="min-w-[9.5rem] p-1.5 align-top">
        <div className="flex h-full min-h-[3.25rem] items-center justify-center rounded-xs border border-dashed border-border/40 bg-muted/5 px-2 py-1 text-[11px] text-muted-foreground/45 italic select-none">
          {cfg.emptyLabel}
        </div>
      </td>
    )
  }

  return (
    <td className="min-w-[9.5rem] p-1.5 align-top">
      <div
        className={cn(
          "group/layer flex h-full min-h-[3.25rem] cursor-grab flex-col justify-start rounded-xs border p-2 transition-all select-none active:cursor-grabbing",
          cfg.border,
          cfg.bg,
          cfg.glow,
          justApplied &&
            "scale-[0.98] ring-2 ring-white/90 brightness-125 shadow-[0_0_14px_rgba(255,255,255,0.4)]"
        )}
        draggable
        onDragStart={(e) => {
          const payload: GearLayerDragPayload = { itemId: hit.id, layer }
          e.dataTransfer.setData(GEAR_LAYER_MIME, JSON.stringify(payload))
          e.dataTransfer.setData("text/plain", `${hit.id}:${layer}`)
          e.dataTransfer.effectAllowed = "copy"
        }}
        onDoubleClick={handleDoubleClick}
        title={`Double-click or drag to apply ${layer.toUpperCase()} to the open sidebar slot`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-xs border px-1 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase",
              cfg.badge
            )}
          >
            <span>{cfg.tag}</span>
            <span className="font-sans font-normal opacity-75">
              · {cfg.label}
            </span>
          </span>
          <span
            className={cn(
              "font-mono text-[9px] transition-all",
              justApplied
                ? "inline font-bold text-gold-hot"
                : "hidden text-muted-foreground opacity-0 group-hover/layer:opacity-100 sm:inline"
            )}
          >
            {justApplied ? "✓ Applied!" : "2× click / drag"}
          </span>
        </div>

        {stats && stats.length > 0 ? (
          <ul
            className={cn(
              "gap-x-2.5 gap-y-0.5 text-xs",
              stats.length > 3 ? "grid grid-cols-2" : "flex flex-col"
            )}
          >
            {stats.map((s) => (
              <li
                key={`${s.id}-${s.type}`}
                className="min-w-0 leading-snug break-words"
              >
                <span className="text-muted-foreground">{s.label}</span>{" "}
                <span className="font-mono whitespace-nowrap text-gold-hot">
                  {formatWikiStatValue(s)}
                </span>
              </li>
            ))}
          </ul>
        ) : lines && lines.length > 0 ? (
          <ul
            className={cn(
              "gap-x-2.5 gap-y-0.5 text-xs",
              lines.length > 2 ? "grid grid-cols-2" : "flex flex-col"
            )}
          >
            {lines.map((line) => (
              <li
                key={line}
                className="min-w-0 leading-snug break-words text-foreground/90"
              >
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </td>
  )
}

export function GearRecommendTable({
  stat,
  onStatChange,
  slot,
  onSlotChange,
  gender,
  equippedParam,
  subcategory,
  onEquipWhole,
  onApplyLayer,
}: {
  stat: PlannerStatKey
  onStatChange: (s: PlannerStatKey) => void
  slot: EquipSlotKey | ""
  onSlotChange: (s: EquipSlotKey | "") => void
  gender: 0 | 1
  equippedParam: string
  subcategory: number | null
  onEquipWhole: (hit: RecommendHit) => void
  onApplyLayer?: (hit: RecommendHit, layer: GearLayer) => void
}) {
  const [q, setQ] = useState("")
  const [layer, setLayer] = useState<GearLayer | "">("")
  const [hits, setHits] = useState<RecommendHit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({
      stat,
      limit: "30",
      equipped: equippedParam,
      gender: String(gender),
    })
    if (slot) params.set("slot", slot)
    if (layer) params.set("layer", layer)
    if (q.trim()) params.set("q", q.trim())
    if (subcategory != null) params.set("subcategory", String(subcategory))
    const handle = window.setTimeout(
      () => {
        fetch(`/api/wiki/recommend?${params}`)
          .then((r) => r.json())
          .then((data: { items: RecommendHit[] }) => {
            if (cancelled) return
            setHits(data.items ?? [])
            setLoading(false)
          })
          .catch(() => {
            if (!cancelled) setLoading(false)
          })
      },
      q.trim() ? 200 : 0
    )
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [stat, slot, layer, q, equippedParam, gender, subcategory])

  const def = PLANNER_STATS.find((s) => s.key === stat)!
  const layerLabel =
    layer === "s1" ? "S1" : layer === "s2" ? "S2" : layer === "s3" ? "S3" : null

  return (
    <div className="space-y-3 border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm tracking-[0.14em] text-gold-dim uppercase">
          Recommendations
        </h3>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Updating…
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="gp-rec-stat">Target stat</FieldLabel>
          <select
            id="gp-rec-stat"
            className="flex h-9 w-full border border-border bg-background px-2 text-sm"
            value={stat}
            onChange={(e) => onStatChange(e.target.value as PlannerStatKey)}
          >
            {PLANNER_STATS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.abbr} — {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="gp-rec-slot">Gear slot</FieldLabel>
          <select
            id="gp-rec-slot"
            className="flex h-9 w-full border border-border bg-background px-2 text-sm"
            value={slot}
            onChange={(e) =>
              onSlotChange((e.target.value || "") as EquipSlotKey | "")
            }
          >
            <option value="">Any slot</option>
            {EQUIP_SLOTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="gp-rec-layer">S* Slot</FieldLabel>
          <select
            id="gp-rec-layer"
            className="flex h-9 w-full border border-border bg-background px-2 text-sm"
            value={layer}
            onChange={(e) => setLayer((e.target.value || "") as GearLayer | "")}
          >
            <option value="">Any layer</option>
            <option value="s1">S1 — Set / SItem</option>
            <option value="s2">S2 — Basic</option>
            <option value="s3">S3 — Characteristics</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="gp-rec-q">Name / ID</FieldLabel>
          <Input
            id="gp-rec-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Optional filter…"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-gold-dim/30 bg-gold-dim/10 px-3 py-2 text-xs text-foreground/90">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-gold-dim" aria-hidden />
          <span>
            <strong className="font-medium text-foreground">
              Interactive layers:
            </strong>{" "}
            Each colored box below is an independent layer.{" "}
            <span className="font-medium text-gold-dim">Double-click</span> or{" "}
            <span className="font-medium text-gold-dim">drag</span> any{" "}
            <span className="font-semibold text-sky-400">S1</span>,{" "}
            <span className="font-semibold text-emerald-400">S2</span>, or{" "}
            <span className="font-semibold text-rose-400">S3</span> card into the
            open sidebar slot.
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Ranked for {def.label}
          {layerLabel ? ` on ${layerLabel}` : ""}.
          {subcategory != null ? " Filtered to slot subcategory." : ""}
        </span>
      </div>
      <div className="relative min-h-[5.5rem]">
        {loading ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-card/55"
            aria-busy="true"
            aria-live="polite"
          >
            <Loader2
              className="size-7 animate-spin text-gold-dim"
              aria-label="Loading recommendations"
            />
          </div>
        ) : null}
        {hits.length === 0 ? (
          loading ? (
            <div className="h-14" aria-hidden />
          ) : (
            <p className="text-sm text-muted-foreground">
              No items fit filters
              {layerLabel ? ` (no ${def.abbr} on ${layerLabel})` : ""}.
            </p>
          )
        ) : (
          <div
            className={cn(
              "overflow-x-auto border border-border transition-opacity",
              loading && "opacity-50"
            )}
          >
            <table className="w-full min-w-[40rem] table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-[11rem]" />
                <col />
                <col />
                <col />
                <col className="w-10" />
              </colgroup>
              <thead>
                <tr className="bg-muted/40 text-left">
                  <th className="px-2 py-1.5 font-medium">Item</th>
                  <th className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1 font-mono font-semibold text-sky-400">
                      <span>S1</span>
                      <span className="font-sans text-[10px] font-normal text-muted-foreground">
                        Set / SItem
                      </span>
                    </span>
                  </th>
                  <th className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1 font-mono font-semibold text-emerald-400">
                      <span>S2</span>
                      <span className="font-sans text-[10px] font-normal text-muted-foreground">
                        Basic
                      </span>
                    </span>
                  </th>
                  <th className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1 font-mono font-semibold text-rose-400">
                      <span>S3</span>
                      <span className="font-sans text-[10px] font-normal text-muted-foreground">
                        Characteristics
                      </span>
                    </span>
                  </th>
                  <th className="w-10 px-1 py-1.5 text-center text-[10px] font-normal text-muted-foreground">
                    Equip
                  </th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr
                    key={hit.id}
                    className="border-t border-border/60 hover:bg-muted/20"
                  >
                    <td className="px-2 py-1.5 align-top">
                      <div className="flex items-start gap-1.5">
                        {hit.iconSrc ? (
                          <Image
                            src={hit.iconSrc}
                            alt=""
                            width={24}
                            height={24}
                            className="pixelated shrink-0 border border-border bg-black/40"
                            unoptimized
                          />
                        ) : (
                          <span className="inline-block size-6 shrink-0 border border-border bg-muted/50" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 items-center gap-1">
                            <Link
                              href={`/wiki/items/${hit.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-xs text-[#c9a0ff] no-underline hover:text-gold-hot hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {hit.name}
                            </Link>
                            <WikiGenderBadge
                              gender={hit.gender ?? 2}
                              label={hit.genderLabel ?? "Any"}
                              iconOnly
                              className="shrink-0 [&_svg]:size-3"
                            />
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {hit.equipSlot}
                            {hit.completesSetIds.length
                              ? ` · set ${hit.completesSetIds.join(",")}`
                              : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <DraggableLayerCell
                      hit={hit}
                      layer="s1"
                      lines={hit.setBonus}
                      onApplyLayer={onApplyLayer}
                    />
                    <DraggableLayerCell
                      hit={hit}
                      layer="s2"
                      stats={hit.basicFeatures}
                      onApplyLayer={onApplyLayer}
                    />
                    <DraggableLayerCell
                      hit={hit}
                      layer="s3"
                      stats={hit.characteristics}
                      onApplyLayer={onApplyLayer}
                    />
                    <td className="px-1 py-1.5 align-middle text-center">
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          className="inline-flex size-7 items-center justify-center rounded-xs border border-border/80 bg-muted/40 text-muted-foreground transition-all hover:border-gold hover:bg-gold/15 hover:text-gold-hot hover:shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                          aria-label="Equip whole piece"
                          onClick={() => onEquipWhole(hit)}
                        >
                          <Layers className="size-3.5" aria-hidden />
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[14rem] text-center">
                          Equip base piece + all layers (S1, S2, S3)
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Build a minimal WikiItem from a recommend hit for equip-all. */
export function recommendHitToWikiItem(hit: RecommendHit): WikiItem {
  return {
    id: hit.id,
    name: hit.name,
    description: "",
    icon: 0,
    iconSrc: hit.iconSrc,
    equipType: "",
    equipSlot: hit.equipSlot,
    weaponType: null,
    gender: hit.gender ?? 2,
    genderLabel: hit.genderLabel ?? "Any",
    buyPrice: 0,
    sellPrice: 0,
    level: hit.level,
    durability: 0,
    stackSize: 1,
    setBonus: hit.setBonus,
    basicFeatures: hit.basicFeatures,
    characteristics: hit.characteristics,
    stats: hit.basicFeatures,
  }
}
