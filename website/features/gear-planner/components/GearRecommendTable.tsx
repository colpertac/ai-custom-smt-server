"use client"

import { Layers, Loader2, WandSparkles } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import type { WikiItem, WikiItemStat } from "@/content/wiki/types"
import {
  formatWikiStatValue,
  wikiClientBasicFeatures,
  wikiClientCharacteristics,
} from "@/content/wiki/format"
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
  wikiLayerSetLines,
  type CombatFocus,
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
    label: "Set",
    border: "border-sky-500/40 hover:border-sky-400",
    bg: "bg-sky-950/20 hover:bg-sky-950/35",
    badge: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    glow: "hover:shadow-[0_0_10px_rgba(56,189,248,0.22)]",
    emptyLabel: "No set",
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

/** Max lines shown before "+N more" (keeps recommend rows compact). */
const LAYER_CLAMP = 4

function isPartnerLine(text: string): boolean {
  return /^Partner'?s\b/i.test(text.trim())
}

type LayerDisplayLine = {
  key: string
  partner: boolean
  node: React.ReactNode
}

function linesFromStrings(lines: string[]): LayerDisplayLine[] {
  return lines.map((line, i) => ({
    key: `l-${i}-${line}`,
    partner: isPartnerLine(line),
    node: <span className="text-foreground/90">{line}</span>,
  }))
}

function linesFromStats(stats: WikiItemStat[]): LayerDisplayLine[] {
  return stats.map((s) => ({
    key: `s-${s.id}-${s.type}`,
    partner: isPartnerLine(s.label),
    node: (
      <>
        <span className="text-muted-foreground">{s.label}</span>{" "}
        <span className="font-mono whitespace-nowrap text-gold-hot">
          {formatWikiStatValue(s)}
        </span>
      </>
    ),
  }))
}

function splitByRankFocus(
  all: LayerDisplayLine[],
  rankFocus: CombatFocus
): {
  primary: LayerDisplayLine[]
  secondary: LayerDisplayLine[]
  secondaryLabel: string | null
} {
  if (rankFocus === "both" || all.length === 0) {
    return { primary: all, secondary: [], secondaryLabel: null }
  }
  const partner = all.filter((l) => l.partner)
  const player = all.filter((l) => !l.partner)
  if (rankFocus === "partner") {
    if (partner.length === 0) {
      return { primary: player, secondary: [], secondaryLabel: null }
    }
    return {
      primary: partner,
      secondary: player,
      secondaryLabel: player.length ? "Player" : null,
    }
  }
  if (player.length === 0) {
    return { primary: partner, secondary: [], secondaryLabel: null }
  }
  return {
    primary: player,
    secondary: partner,
    secondaryLabel: partner.length ? "Partner" : null,
  }
}

function LayerLineList({ lines }: { lines: LayerDisplayLine[] }) {
  if (lines.length === 0) return null
  return (
    <ul className="flex flex-col gap-y-0.5 text-xs">
      {lines.map((line) => (
        <li key={line.key} className="min-w-0 leading-snug break-words">
          {line.node}
        </li>
      ))}
    </ul>
  )
}

function DraggableLayerCell({
  hit,
  layer,
  lines,
  stats,
  rankFocus,
  onApplyLayer,
}: {
  hit: RecommendHit
  layer: GearLayer
  lines?: string[]
  stats?: WikiItemStat[]
  rankFocus: CombatFocus
  onApplyLayer?: (hit: RecommendHit, layer: GearLayer) => void
}) {
  const [justApplied, setJustApplied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showSecondary, setShowSecondary] = useState(false)
  const cfg = LAYER_CONFIG[layer]

  const allLines = useMemo(() => {
    if (stats && stats.length > 0) return linesFromStats(stats)
    if (lines && lines.length > 0) return linesFromStrings(lines)
    return []
  }, [stats, lines])

  useEffect(() => {
    setExpanded(false)
    setShowSecondary(false)
  }, [hit.id, rankFocus, layer])

  const { primary, secondary, secondaryLabel } = splitByRankFocus(
    allLines,
    rankFocus
  )
  const hasContent = allLines.length > 0

  const visiblePrimary = expanded
    ? primary
    : primary.slice(0, LAYER_CLAMP)
  const hiddenPrimary = Math.max(0, primary.length - visiblePrimary.length)

  const handleDoubleClick = () => {
    setJustApplied(true)
    window.setTimeout(() => setJustApplied(false), 800)
    onApplyLayer?.(hit, layer)
  }

  if (!hasContent) {
    return (
      <td className="min-w-[10.5rem] p-1.5 align-top">
        <div className="flex h-full min-h-[3.25rem] items-center justify-center rounded-xs border border-dashed border-border/40 bg-muted/5 px-2 py-1 text-[11px] text-muted-foreground/45 italic select-none">
          {cfg.emptyLabel}
        </div>
      </td>
    )
  }

  return (
    <td className="min-w-[10.5rem] p-1.5 align-top">
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

        <div className="space-y-1">
          <LayerLineList lines={visiblePrimary} />
          {hiddenPrimary > 0 ? (
            <button
              type="button"
              className="text-left text-[10px] font-medium text-gold-dim hover:text-gold-hot"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(true)
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              +{hiddenPrimary} more
            </button>
          ) : null}
          {expanded && primary.length > LAYER_CLAMP ? (
            <button
              type="button"
              className="text-left text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(false)
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              Show less
            </button>
          ) : null}
          {secondaryLabel && secondary.length > 0 ? (
            showSecondary ? (
              <div className="space-y-1 border-t border-border/40 pt-1">
                <LayerLineList lines={secondary} />
                <button
                  type="button"
                  className="text-left text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowSecondary(false)
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  Hide {secondaryLabel}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="rounded-xs border border-border/50 bg-muted/30 px-1.5 py-0.5 text-left text-[10px] font-medium text-muted-foreground hover:border-gold-dim/50 hover:text-gold-dim"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowSecondary(true)
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                {secondaryLabel} ×{secondary.length}
              </button>
            )
          ) : null}
        </div>
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
  /** Ranking bucket — independent of combat-matrix focus. */
  const [rankFocus, setRankFocus] = useState<CombatFocus>("player")
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
      focus: rankFocus,
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
  }, [stat, slot, layer, q, equippedParam, gender, subcategory, rankFocus])

  const def = PLANNER_STATS.find((s) => s.key === stat)!
  const layerLabel =
    layer === "s1" ? "S1" : layer === "s2" ? "S2" : layer === "s3" ? "S3" : null
  const rankFocusLabel =
    rankFocus === "partner"
      ? "Partner"
      : rankFocus === "both"
        ? "Player + Partner"
        : "Player"

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
          <FieldLabel htmlFor="gp-rec-rank">Rank for</FieldLabel>
          <select
            id="gp-rec-rank"
            className="flex h-9 w-full border border-border bg-background px-2 text-sm"
            value={rankFocus}
            onChange={(e) =>
              setRankFocus(e.target.value as CombatFocus)
            }
            title="Which combat bucket recommendations score against"
          >
            <option value="player">Player</option>
            <option value="partner">Partner / demon</option>
            <option value="both">Both (combined)</option>
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
            <option value="s1">S1 — Set bonus</option>
            <option value="s2">S2 — Basic features</option>
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
          <WandSparkles className="size-4 shrink-0 text-gold-dim" aria-hidden />
          <span>
            <strong className="font-medium text-foreground">
              Interactive layers:
            </strong>{" "}
            Each colored box below is an independent layer.{" "}
            <span className="font-medium text-gold-dim">Double-click</span> or{" "}
            <span className="font-medium text-gold-dim">drag</span> any{" "}
            <span className="font-semibold text-sky-400">S1 Set</span>,{" "}
            <span className="font-semibold text-emerald-400">S2 Basic</span>, or{" "}
            <span className="font-semibold text-rose-400">S3 Char</span> card
            into the open sidebar slot (same buckets as the wiki item page).
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Ranked for {def.label} · {rankFocusLabel}
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
            <table className="w-full min-w-[36rem] table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-[12rem]" />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="bg-muted/40 text-left">
                  <th className="px-2 py-1.5 font-medium">Item</th>
                  <th className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1 font-mono font-semibold text-sky-400">
                      <span>S1</span>
                      <span className="font-sans text-[10px] font-normal text-muted-foreground">
                        Set
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
                        Char
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => {
                  const asItem = recommendHitToWikiItem(hit)
                  return (
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
                              className="min-w-0 truncate text-xs text-[#c9a0ff] no-underline hover:text-gold-hot hover:underline"
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
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <p className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                              {hit.equipSlot}
                              {hit.completesSetIds.length
                                ? ` · set ${hit.completesSetIds.join(",")}`
                                : ""}
                            </p>
                            <Tooltip>
                              <TooltipTrigger
                                type="button"
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-xs border border-border/80 bg-muted/40 text-muted-foreground transition-all hover:border-gold hover:bg-gold/15 hover:text-gold-hot hover:shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
                                aria-label="Equip whole piece"
                                onClick={() => onEquipWhole(hit)}
                              >
                                <Layers className="size-3" aria-hidden />
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="max-w-[14rem] text-center"
                              >
                                Equip base piece + all layers (S1, S2, S3)
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </td>
                    <DraggableLayerCell
                      hit={hit}
                      layer="s1"
                      lines={wikiLayerSetLines(hit.id)}
                      rankFocus={rankFocus}
                      onApplyLayer={onApplyLayer}
                    />
                    <DraggableLayerCell
                      hit={hit}
                      layer="s2"
                      stats={wikiClientBasicFeatures(asItem)}
                      rankFocus={rankFocus}
                      onApplyLayer={onApplyLayer}
                    />
                    <DraggableLayerCell
                      hit={hit}
                      layer="s3"
                      lines={wikiClientCharacteristics(asItem)}
                      rankFocus={rankFocus}
                      onApplyLayer={onApplyLayer}
                    />
                  </tr>
                  )
                })}
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
