"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

import { getWikiItem, type WikiItem, type WikiItemStat } from "@/content/wiki"
import { formatWikiStatValue } from "@/content/wiki"
import { WikiGenderBadge } from "@/features/wiki/components/WikiGenderBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { EquipSlotKey } from "@/lib/armory-equipment"
import {
  GEAR_LAYER_MIME,
  layerHasContent,
  plannerSlotDisplay,
  type GearLayer,
  type GearLayerDragPayload,
  type PlannerSlot,
  wikiSlotLabelForKey,
} from "@/lib/gear-planner-combat"
import { cn } from "@/lib/utils"

function CompactLayerBody({
  layer,
  item,
}: {
  layer: GearLayer
  item: WikiItem
}) {
  const stats: WikiItemStat[] | undefined =
    layer === "s2"
      ? item.basicFeatures
      : layer === "s3"
        ? item.characteristics
        : undefined
  const lines = layer === "s1" ? item.setBonus : undefined

  if (stats && stats.length > 0) {
    return (
      <ul className="space-y-0.5 text-[11px] leading-snug">
        {stats.map((s) => (
          <li
            key={`${s.id}-${s.type}`}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="min-w-0 truncate text-muted-foreground">
              {s.label}
            </span>
            <span className="shrink-0 font-mono text-gold-hot">
              {formatWikiStatValue(s)}
            </span>
          </li>
        ))}
      </ul>
    )
  }
  if (lines && lines.length > 0) {
    return (
      <ul className="space-y-0.5 text-[11px] leading-snug text-foreground/90">
        {lines.map((line) => (
          <li key={line} className="truncate">
            {line}
          </li>
        ))}
      </ul>
    )
  }
  if (!layerHasContent(item, layer)) {
    return (
      <p className="text-[11px] text-muted-foreground italic">Vacant</p>
    )
  }
  return null
}

function LayerDropCard({
  layer,
  title,
  tag,
  item,
  emptyHint,
  onDropDonor,
}: {
  layer: GearLayer
  title: string
  tag: string
  item: WikiItem | null
  emptyHint: string
  onDropDonor: (donor: WikiItem, layer: GearLayer) => void
}) {
  const [over, setOver] = useState(false)
  const border =
    layer === "s1"
      ? "border-sky-500/60"
      : layer === "s2"
        ? "border-emerald-500/60"
        : "border-rose-500/60"

  return (
    <div
      className={cn(
        "border border-dashed px-2 py-1.5 transition-colors",
        border,
        over && "bg-muted/40"
      )}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const raw =
          e.dataTransfer.getData(GEAR_LAYER_MIME) ||
          e.dataTransfer.getData("text/plain")
        if (!raw) return
        let payload: GearLayerDragPayload | null = null
        try {
          payload = JSON.parse(raw) as GearLayerDragPayload
        } catch {
          const [idStr, layerStr] = raw.split(":")
          if (
            idStr &&
            (layerStr === "s1" || layerStr === "s2" || layerStr === "s3")
          ) {
            payload = { itemId: Number(idStr), layer: layerStr }
          }
        }
        if (!payload || payload.layer !== layer) return
        const donor = getWikiItem(payload.itemId)
        if (!donor) return
        onDropDonor(donor, layer)
      }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-[10px] tracking-[0.12em] text-gold-dim uppercase">
          <span
            className={cn(
              "mr-1.5 font-mono",
              layer === "s1"
                ? "text-sky-400"
                : layer === "s2"
                  ? "text-emerald-400"
                  : "text-rose-400"
            )}
          >
            {tag}
          </span>
          {title}
        </h3>
        {item ? (
          <span className="truncate text-[10px] text-[#c9a0ff]">
            {item.name}
          </span>
        ) : null}
      </div>
      {!item ? (
        <p className="text-[11px] text-muted-foreground">{emptyHint}</p>
      ) : (
        <CompactLayerBody layer={layer} item={item} />
      )}
    </div>
  )
}

export function GearSlotSidebar({
  slotKey,
  equipped,
  gender,
  dropError,
  onClose,
  onClear,
  onSelectWhole,
  onDropLayer,
}: {
  slotKey: EquipSlotKey
  equipped: PlannerSlot
  gender: 0 | 1
  dropError: string | null
  onClose: () => void
  onClear: () => void
  onSelectWhole: (item: WikiItem) => void
  onDropLayer: (item: WikiItem, layer: GearLayer) => void
}) {
  const [q, setQ] = useState("")
  const [items, setItems] = useState<WikiItem[]>([])
  const [loading, setLoading] = useState(false)
  const slotLabel = wikiSlotLabelForKey(slotKey)
  const display = plannerSlotDisplay(equipped)
  const s1 =
    equipped.s1ItemId != null ? (getWikiItem(equipped.s1ItemId) ?? null) : null
  const s2 =
    equipped.s2ItemId != null ? (getWikiItem(equipped.s2ItemId) ?? null) : null
  const s3 =
    equipped.s3ItemId != null ? (getWikiItem(equipped.s3ItemId) ?? null) : null

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({
      category:
        slotKey === "weapon" || slotKey === "bullets" ? "weapons" : "armor",
      slot: slotLabel,
      limit: "40",
      gender: String(gender),
    })
    if (q.trim()) params.set("q", q.trim())
    if (slotKey === "weapon") {
      params.set("category", "weapons")
      params.delete("slot")
    } else if (slotKey === "bullets") {
      params.set("category", "all")
      params.set("slot", "Bullets")
    }
    const handle = window.setTimeout(() => {
      setLoading(true)
      fetch(`/api/wiki/browse?${params}`)
        .then((r) => r.json())
        .then((data: { items: WikiItem[] }) => {
          if (cancelled) return
          setItems(data.items ?? [])
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
  }, [slotKey, slotLabel, q, gender])

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border bg-card/80">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <h2 className="font-heading text-sm tracking-wide uppercase">
          {slotLabel}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={equipped.s1ItemId == null}
            onClick={onClear}
          >
            Unequip
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="space-y-1.5 border-b border-border p-2.5">
          {equipped.s1ItemId == null ? (
            <p className="text-[11px] text-muted-foreground">
              Empty — equip a base piece below, then drag or double-click S2/S3
              from recommendations.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              {display.iconSrc ? (
                <Image
                  src={display.iconSrc}
                  alt=""
                  width={36}
                  height={36}
                  className="pixelated shrink-0 border border-border bg-black/40"
                  unoptimized
                />
              ) : (
                <span className="inline-block size-9 shrink-0 border border-border bg-muted/50" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm text-[#c9a0ff]">
                    {display.name}
                  </span>
                  {s1 ? (
                    <WikiGenderBadge
                      gender={s1.gender}
                      label={s1.genderLabel}
                      iconOnly
                      className="shrink-0 [&_svg]:size-3.5"
                    />
                  ) : null}
                </p>
                <p className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-mono">#{equipped.s1ItemId}</span>
                  <Link
                    href={`/wiki/items/${equipped.s1ItemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold-dim no-underline hover:text-gold-hot"
                  >
                    Wiki →
                  </Link>
                </p>
              </div>
            </div>
          )}

          {dropError ? (
            <p className="border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {dropError}
            </p>
          ) : null}

          <LayerDropCard
            layer="s1"
            title="Set bonus"
            tag="S1"
            item={s1}
            emptyHint="Drop / double-click S1 here."
            onDropDonor={onDropLayer}
          />
          <LayerDropCard
            layer="s2"
            title="Basic"
            tag="S2"
            item={s2}
            emptyHint="Drop / double-click S2 here."
            onDropDonor={onDropLayer}
          />
          <LayerDropCard
            layer="s3"
            title="Char"
            tag="S3"
            item={s3}
            emptyHint="Drop / double-click S3 here."
            onDropDonor={onDropLayer}
          />
        </section>

        <section className="p-2.5">
          <h3 className="font-heading text-[10px] tracking-[0.14em] text-gold-dim uppercase">
            Equip whole piece
          </h3>
          <Input
            className="mt-1.5 h-8 text-xs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or item ID…"
          />
          <div className="mt-1.5 max-h-[22vh] overflow-y-auto border border-border">
            {loading ? (
              <p className="p-2 text-xs text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">No matches.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const active = item.id === equipped.s1ItemId
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-1.5 px-1.5 py-1 text-left hover:bg-muted/40",
                          active && "bg-muted/50"
                        )}
                        onClick={() => onSelectWhole(item)}
                      >
                        {item.iconSrc ? (
                          <Image
                            src={item.iconSrc}
                            alt=""
                            width={22}
                            height={22}
                            className="pixelated shrink-0 border border-border bg-black/40"
                            unoptimized
                          />
                        ) : (
                          <span className="inline-block size-5 shrink-0 border border-border bg-muted/50" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs text-[#c9a0ff]">
                          {item.name}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                          #{item.id}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </aside>
  )
}
