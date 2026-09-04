import { type NextRequest, NextResponse } from "next/server"

import { EQUIP_SLOTS, type EquipSlotKey } from "@/lib/armory-equipment"
import {
  emptyPlannerLoadout,
  equipWikiItemOntoSlot,
  PLANNER_STATS,
  rankItemsForStat,
  type PlannerStatKey,
} from "@/lib/gear-planner-combat"
import { getWikiItem } from "@/content/wiki"
import { isWikiAvailable } from "@/lib/wiki-availability"

const STAT_KEYS = new Set(PLANNER_STATS.map((s) => s.key))
const SLOT_KEYS = new Set(EQUIP_SLOTS.map((s) => s.key))

export async function GET(req: NextRequest) {
  if (!isWikiAvailable()) {
    return NextResponse.json(
      { error: "Wiki unavailable until BinaryData is uploaded", enabled: false },
      { status: 503 }
    )
  }

  const stat = req.nextUrl.searchParams.get("stat") as PlannerStatKey | null
  if (!stat || !STAT_KEYS.has(stat)) {
    return NextResponse.json(
      { error: `stat must be one of: ${[...STAT_KEYS].join(", ")}` },
      { status: 400 }
    )
  }

  const slotParam = req.nextUrl.searchParams.get("slot")
  const slot =
    slotParam && SLOT_KEYS.has(slotParam as EquipSlotKey)
      ? (slotParam as EquipSlotKey)
      : null

  const q = req.nextUrl.searchParams.get("q") ?? ""
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 30)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), 80)
    : 30

  // equipped=itemType per EQUIP_SLOTS order, comma-separated (0 = empty)
  let loadout = emptyPlannerLoadout()
  const equippedParam = req.nextUrl.searchParams.get("equipped")
  if (equippedParam) {
    const parts = equippedParam.split(",").map((p) => Number(p.trim()))
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
      const id = parts[i] ?? 0
      if (!id || !Number.isFinite(id)) continue
      const item = getWikiItem(id)
      if (!item) continue
      loadout = equipWikiItemOntoSlot(loadout, EQUIP_SLOTS[i]!.key, item)
    }
  }

  const hits = rankItemsForStat({
    stat,
    slot,
    layer: (() => {
      const raw = req.nextUrl.searchParams.get("layer")
      if (raw === "s1" || raw === "s2" || raw === "s3") return raw
      return null
    })(),
    loadout,
    excludeEquipped: true,
    limit,
    query: q,
    gender:
      req.nextUrl.searchParams.get("gender") === "0" ||
      req.nextUrl.searchParams.get("gender") === "1"
        ? (Number(req.nextUrl.searchParams.get("gender")) as 0 | 1)
        : null,
    subcategory: (() => {
      const raw = req.nextUrl.searchParams.get("subcategory")
      if (raw == null || raw === "") return null
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    })(),
  })

  return NextResponse.json({
    total: hits.length,
    items: hits.map((h) => ({
      id: h.item.id,
      name: h.item.name,
      iconSrc: h.item.iconSrc ?? null,
      equipSlot: h.item.equipSlot,
      slotKey: h.slotKey,
      level: h.item.level,
      gender: h.item.gender,
      genderLabel: h.item.genderLabel,
      pieceContribution: h.pieceContribution,
      setCompletionBonus: h.setCompletionBonus,
      score: h.score,
      completesSetIds: h.completesSetIds,
      basicFeatures: h.item.basicFeatures ?? [],
      characteristics: h.item.characteristics ?? [],
      setBonus: h.item.setBonus ?? [],
    })),
  })
}
