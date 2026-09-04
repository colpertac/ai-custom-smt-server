"use client"

import { Layers } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

import type { WikiItem, WikiItemStat } from "@/content/wiki"
import { formatWikiStatValue } from "@/content/wiki"
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

function LayerLines({
  layer,
  lines,
  stats,
}: {
  layer: GearLayer
  lines?: string[]
  stats?: WikiItemStat[]
}) {
  const border =
    layer === "s1"
      ? "border-sky-500/50"
      : layer === "s2"
        ? "border-emerald-500/50"
        : "border-rose-500/50"

  if (stats && stats.length > 0) {
    return (
      <ul
        className={cn(
          "gap-x-3 gap-y-0.5 border-l-2 pl-1.5 text-xs",
          stats.length > 3 ? "grid grid-cols-2" : "flex flex-col",
          border
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
    )
  }
  if (lines && lines.length > 0) {
    return (
      <ul
        className={cn(
          "gap-x-3 gap-y-0.5 border-l-2 pl-1.5 text-xs",
          lines.length > 2 ? "grid grid-cols-2" : "flex flex-col",
          border
        )}
      >
        {lines.map((line) => (
          <li key={line} className="min-w-0 leading-snug break-words">
            {line}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <span className="text-xs text-muted-foreground/60 italic">Empty</span>
  )
}

function DraggableLayerCell({
  hit,
  layer,
  onApplyLayer,
  children,
}: {
  hit: RecommendHit
  layer: GearLayer
  onApplyLayer?: (hit: RecommendHit, layer: GearLayer) => void
  children: React.ReactNode
}) {
  return (
    <td
      className="min-w-[9rem] cursor-grab px-2 py-1.5 align-top active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        const payload: GearLayerDragPayload = { itemId: hit.id, layer }
        e.dataTransfer.setData(GEAR_LAYER_MIME, JSON.stringify(payload))
        e.dataTransfer.setData("text/plain", `${hit.id}:${layer}`)
        e.dataTransfer.effectAllowed = "copy"
      }}
      onDoubleClick={() => onApplyLayer?.(hit, layer)}
      title={`Drag or double-click to apply ${layer.toUpperCase()} to the open sidebar slot`}
    >
      {children}
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
  const [hits, setHits] = useState<RecommendHit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({
      stat,
      limit: "30",
      equipped: equippedParam,
      gender: String(gender),
    })
    if (slot) params.set("slot", slot)
    if (q.trim()) params.set("q", q.trim())
    if (subcategory != null) params.set("subcategory", String(subcategory))
    const handle = window.setTimeout(() => {
      setLoading(true)
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
    }, q.trim() ? 200 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [stat, slot, q, equippedParam, gender, subcategory])

  const def = PLANNER_STATS.find((s) => s.key === stat)!

  return (
    <div className="space-y-3 border border-border bg-card/40 p-4">
      <h3 className="font-heading text-sm tracking-[0.14em] text-gold-dim uppercase">
        Recommendations
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
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
          <FieldLabel htmlFor="gp-rec-slot">Slot filter</FieldLabel>
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
          <FieldLabel htmlFor="gp-rec-q">Name / ID</FieldLabel>
          <Input
            id="gp-rec-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Optional filter…"
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Ranked for {def.label}. Drag an S1 / S2 / S3 cell onto the matching
        sidebar card, or double-click it while the sidebar is open.
        {subcategory != null ? " Filtered to this slot’s subcategory family." : null}
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Searching…</p>
      ) : hits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching gear.</p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[40rem] table-fixed border-collapse text-xs">
            <colgroup>
              <col className="w-[11rem]" />
              <col />
              <col />
              <col />
              <col className="w-9" />
            </colgroup>
            <thead>
              <tr className="bg-muted/40 text-left">
                <th className="px-2 py-1.5">Item</th>
                <th className="px-2 py-1.5 text-sky-400">S1</th>
                <th className="px-2 py-1.5 text-emerald-400">S2</th>
                <th className="px-2 py-1.5 text-rose-400">S3</th>
                <th className="px-1 py-1.5" />
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
                    onApplyLayer={onApplyLayer}
                  >
                    <LayerLines layer="s1" lines={hit.setBonus} />
                  </DraggableLayerCell>
                  <DraggableLayerCell
                    hit={hit}
                    layer="s2"
                    onApplyLayer={onApplyLayer}
                  >
                    <LayerLines layer="s2" stats={hit.basicFeatures} />
                  </DraggableLayerCell>
                  <DraggableLayerCell
                    hit={hit}
                    layer="s3"
                    onApplyLayer={onApplyLayer}
                  >
                    <LayerLines layer="s3" stats={hit.characteristics} />
                  </DraggableLayerCell>
                  <td className="px-1 py-1.5 align-top">
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        className="inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-gold-hot focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        aria-label="Equip all"
                        onClick={() => onEquipWhole(hit)}
                      >
                        <Layers className="size-3.5" aria-hidden />
                      </TooltipTrigger>
                      <TooltipContent side="left">Equip all</TooltipContent>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
