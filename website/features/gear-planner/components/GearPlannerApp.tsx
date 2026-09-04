"use client"

import Image from "next/image"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"

import { getWikiItem, type WikiItem } from "@/content/wiki"
import { GearCombatMatrix } from "@/features/gear-planner/components/GearCombatMatrix"
import {
  GearRecommendTable,
  recommendHitToWikiItem,
  type RecommendHit,
} from "@/features/gear-planner/components/GearRecommendTable"
import { GearSlotSidebar } from "@/features/gear-planner/components/GearSlotSidebar"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { EQUIP_SLOTS, type EquipSlotKey } from "@/lib/armory-equipment"
import {
  SET_HEADER_COLORS,
  applyLayerToSlot,
  canApplyLayer,
  computeGearPlannerCombat,
  emptyPlannerLoadout,
  equipWikiItemOntoSlot,
  itemSubcategory,
  plannerSlotDisplay,
  type GearLayer,
  type PlannerAttrs,
  type PlannerSlot,
  type PlannerStatKey,
  type SetStatus,
} from "@/lib/gear-planner-combat"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "imagine-gear-planner-v2"

export type PlannerGender = 0 | 1

type StoredState = {
  slots: Array<{
    s1: number | null
    s2: number | null
    s3: number | null
  }>
  attrs: PlannerAttrs
  gender?: PlannerGender
}

function loadStored(): {
  loadout: PlannerSlot[]
  attrs: PlannerAttrs
  gender: PlannerGender
} {
  const empty = emptyPlannerLoadout()
  const defaultAttrs = { intel: 0, speed: 0, vit: 0 }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { loadout: empty, attrs: defaultAttrs, gender: 0 }
    const parsed = JSON.parse(raw) as StoredState
    const loadout = empty.map((slot, i) => {
      const row = parsed.slots?.[i]
      if (!row) return slot
      return {
        ...slot,
        s1ItemId: row.s1,
        s2ItemId: row.s2,
        s3ItemId: row.s3,
      }
    })
    return {
      loadout,
      attrs: {
        intel: Number(parsed.attrs?.intel) || 0,
        speed: Number(parsed.attrs?.speed) || 0,
        vit: Number(parsed.attrs?.vit) || 0,
      },
      gender: parsed.gender === 1 ? 1 : 0,
    }
  } catch {
    return { loadout: empty, attrs: defaultAttrs, gender: 0 }
  }
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

function persist(
  loadout: PlannerSlot[],
  attrs: PlannerAttrs,
  gender: PlannerGender
) {
  const slots = EQUIP_SLOTS.map((def) => {
    const slot = loadout.find((s) => s.index === def.index)!
    return {
      s1: slot.s1ItemId,
      s2: slot.s2ItemId,
      s3: slot.s3ItemId,
    }
  })
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ slots, attrs, gender })
  )
}

export function GearPlannerApp() {
  const isClient = useIsClient()
  if (!isClient) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Loading planner…
      </div>
    )
  }
  return <GearPlannerAppClient />
}

function GearPlannerAppClient() {
  const stored = loadStored()
  const [loadout, setLoadout] = useState<PlannerSlot[]>(stored.loadout)
  const [attrs, setAttrs] = useState<PlannerAttrs>(stored.attrs)
  const [gender, setGender] = useState<PlannerGender>(stored.gender)
  const [selectedSlot, setSelectedSlot] = useState<EquipSlotKey | null>(null)
  const [recommendStat, setRecommendStat] = useState<PlannerStatKey>("cooldown")
  const [recommendSlot, setRecommendSlot] = useState<EquipSlotKey | "">("")
  const [dropError, setDropError] = useState<string | null>(null)
  const [importName, setImportName] = useState("")
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    persist(loadout, attrs, gender)
  }, [loadout, attrs, gender])

  const combat = useMemo(
    () => computeGearPlannerCombat(loadout, attrs),
    [loadout, attrs]
  )

  const equippedParam = useMemo(
    () =>
      EQUIP_SLOTS.map((def) => {
        const slot = loadout.find((s) => s.index === def.index)
        return slot?.s1ItemId ?? 0
      }).join(","),
    [loadout]
  )

  const selectedEquip =
    selectedSlot != null
      ? (loadout.find((s) => s.slot === selectedSlot) ?? null)
      : null

  const focusedSubcategory = useMemo(() => {
    if (!selectedEquip?.s1ItemId) return null
    return itemSubcategory(selectedEquip.s1ItemId)
  }, [selectedEquip])

  const clearAll = useCallback(() => {
    setLoadout(emptyPlannerLoadout())
    setAttrs({ intel: 0, speed: 0, vit: 0 })
    setSelectedSlot(null)
    setDropError(null)
  }, [])

  const importFromArmory = useCallback(async () => {
    const name = importName.trim()
    if (!name) return
    setImportBusy(true)
    setImportError(null)
    try {
      const res = await fetch(`/api/armory/${encodeURIComponent(name)}`)
      if (!res.ok) {
        setImportError(
          res.status === 404 ? "Character not found" : "Import failed"
        )
        return
      }
      const profile = (await res.json()) as {
        equipment: Array<{
          slot: EquipSlotKey
          itemType: number | null
          basicEffect: number
          specialEffect: number
        }>
        appearance?: { gender?: number }
      }
      setLoadout(
        emptyPlannerLoadout().map((slot) => {
          const src = profile.equipment.find((e) => e.slot === slot.slot)
          if (!src || src.itemType == null) return slot
          const s1 =
            src.specialEffect > 0 ? src.specialEffect : src.itemType
          const basic =
            src.basicEffect > 0 ? src.basicEffect : src.itemType
          return {
            ...slot,
            s1ItemId: s1,
            s2ItemId: basic,
            s3ItemId: basic,
          }
        })
      )
      const g = profile.appearance?.gender
      if (g === 0 || g === 1) setGender(g)
    } catch {
      setImportError("Import failed")
    } finally {
      setImportBusy(false)
    }
  }, [importName])

  const handleDropLayer = useCallback(
    (donor: WikiItem, layer: GearLayer) => {
      if (!selectedSlot || !selectedEquip) return
      const check = canApplyLayer({
        target: selectedEquip,
        donor,
        layer,
        gender,
      })
      if (!check.ok) {
        setDropError(check.reason ?? "Cannot apply layer")
        return
      }
      setDropError(null)
      setLoadout((prev) => applyLayerToSlot(prev, selectedSlot, layer, donor))
    },
    [selectedSlot, selectedEquip, gender]
  )

  return (
    <div className="flex h-[calc(100dvh-3.5rem-2.75rem)] min-h-[32rem] w-full">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="space-y-4">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-[0.1em] uppercase sm:text-3xl">
                Gear builder
              </h1>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
                S1 / S2 / S3 columns show which layer contributes. Drag
                recommendation cells onto the sidebar layer cards.
              </p>
            </div>
            <div className="flex items-center gap-1 border border-border p-1">
              <Button
                type="button"
                size="xs"
                variant={gender === 0 ? "default" : "ghost"}
                onClick={() => setGender(0)}
              >
                Male
              </Button>
              <Button
                type="button"
                size="xs"
                variant={gender === 1 ? "default" : "ghost"}
                onClick={() => setGender(1)}
              >
                Female
              </Button>
            </div>
          </header>

          <div className="flex flex-wrap items-end gap-3 border border-border bg-card/40 p-3">
            <Field className="min-w-[6rem]">
              <FieldLabel htmlFor="gp-int">INT</FieldLabel>
              <Input
                id="gp-int"
                type="number"
                value={attrs.intel}
                onChange={(e) =>
                  setAttrs((a) => ({
                    ...a,
                    intel: Number(e.target.value) || 0,
                  }))
                }
              />
            </Field>
            <Field className="min-w-[6rem]">
              <FieldLabel htmlFor="gp-spd">SPD</FieldLabel>
              <Input
                id="gp-spd"
                type="number"
                value={attrs.speed}
                onChange={(e) =>
                  setAttrs((a) => ({
                    ...a,
                    speed: Number(e.target.value) || 0,
                  }))
                }
              />
            </Field>
            <Field className="min-w-[6rem]">
              <FieldLabel htmlFor="gp-vit">VIT</FieldLabel>
              <Input
                id="gp-vit"
                type="number"
                value={attrs.vit}
                onChange={(e) =>
                  setAttrs((a) => ({
                    ...a,
                    vit: Number(e.target.value) || 0,
                  }))
                }
              />
            </Field>
            <Field className="min-w-[12rem] flex-1">
              <FieldLabel htmlFor="gp-import">Import from armory</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="gp-import"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="Character name"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={importBusy || !importName.trim()}
                  onClick={() => void importFromArmory()}
                >
                  {importBusy ? "…" : "Import"}
                </Button>
              </div>
              {importError ? (
                <p className="mt-1 text-xs text-destructive">{importError}</p>
              ) : null}
            </Field>
            <Button type="button" variant="outline" onClick={clearAll}>
              Clear
            </Button>
          </div>

          <GearLoadoutStrip
            loadout={loadout}
            selectedSlot={selectedSlot}
            setColorBySlot={combat.setColorIndexBySlot}
            onPick={(key) => {
              setSelectedSlot(key)
              setRecommendSlot(key)
              setDropError(null)
            }}
            onClear={(key) => {
              setLoadout((prev) => equipWikiItemOntoSlot(prev, key, null))
            }}
          />

          <GearSetLegend
            activeSets={combat.activeSets}
            partialSets={combat.partialSets}
          />

          <GearCombatMatrix
            loadout={loadout}
            combat={combat}
            attrs={attrs}
            onStatClick={(stat) => {
              setRecommendStat(stat)
              if (selectedSlot) setRecommendSlot(selectedSlot)
            }}
            onSlotHeaderClick={(key) => {
              setSelectedSlot(key)
              setRecommendSlot(key)
              setDropError(null)
            }}
          />

          <GearRecommendTable
            stat={recommendStat}
            onStatChange={setRecommendStat}
            slot={recommendSlot}
            onSlotChange={setRecommendSlot}
            gender={gender}
            equippedParam={equippedParam}
            subcategory={
              recommendSlot && recommendSlot === selectedSlot
                ? focusedSubcategory
                : null
            }
            onEquipWhole={(hit: RecommendHit) => {
              const item = recommendHitToWikiItem(hit)
              setLoadout((prev) =>
                equipWikiItemOntoSlot(prev, hit.slotKey, item)
              )
              setSelectedSlot(hit.slotKey)
              setDropError(null)
            }}
            onApplyLayer={(hit, layer) => {
              if (!selectedSlot) return
              const donor = getWikiItem(hit.id) ?? recommendHitToWikiItem(hit)
              handleDropLayer(donor, layer)
            }}
          />
        </div>
      </div>

      {selectedSlot && selectedEquip ? (
        <div className="hidden w-[min(100%,24rem)] shrink-0 lg:block xl:w-[28rem]">
          <GearSlotSidebar
            key={selectedSlot}
            slotKey={selectedSlot}
            equipped={selectedEquip}
            gender={gender}
            dropError={dropError}
            onClose={() => setSelectedSlot(null)}
            onClear={() => {
              setLoadout((prev) =>
                equipWikiItemOntoSlot(prev, selectedSlot, null)
              )
              setDropError(null)
            }}
            onSelectWhole={(item) => {
              setLoadout((prev) =>
                equipWikiItemOntoSlot(prev, selectedSlot, item)
              )
              setDropError(null)
            }}
            onDropLayer={handleDropLayer}
          />
        </div>
      ) : null}

      {selectedSlot && selectedEquip ? (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[75dvh] border-t border-border bg-card shadow-lg lg:hidden">
          <GearSlotSidebar
            key={`m-${selectedSlot}`}
            slotKey={selectedSlot}
            equipped={selectedEquip}
            gender={gender}
            dropError={dropError}
            onClose={() => setSelectedSlot(null)}
            onClear={() => {
              setLoadout((prev) =>
                equipWikiItemOntoSlot(prev, selectedSlot, null)
              )
              setDropError(null)
            }}
            onSelectWhole={(item) => {
              setLoadout((prev) =>
                equipWikiItemOntoSlot(prev, selectedSlot, item)
              )
              setDropError(null)
            }}
            onDropLayer={handleDropLayer}
          />
        </div>
      ) : null}
    </div>
  )
}

function GearLoadoutStrip({
  loadout,
  selectedSlot,
  setColorBySlot,
  onPick,
  onClear,
}: {
  loadout: PlannerSlot[]
  selectedSlot: EquipSlotKey | null
  setColorBySlot: Record<EquipSlotKey, number>
  onPick: (slot: EquipSlotKey) => void
  onClear: (slot: EquipSlotKey) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {loadout.map((slot) => {
        const colorIdx = setColorBySlot[slot.slot]
        const color =
          colorIdx >= 0
            ? SET_HEADER_COLORS[colorIdx % SET_HEADER_COLORS.length]
            : undefined
        const display = plannerSlotDisplay(slot)
        const empty = slot.s1ItemId == null
        const selected = selectedSlot === slot.slot
        return (
          <div
            key={slot.slot}
            className={cn(
              "flex items-center gap-2 border border-border/80 bg-background/40 px-2 py-1.5",
              selected && "border-gold bg-muted/40"
            )}
            style={
              color
                ? { borderLeftWidth: 4, borderLeftColor: color }
                : undefined
            }
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => onPick(slot.slot)}
            >
              {display.iconSrc ? (
                <Image
                  src={display.iconSrc}
                  alt=""
                  width={32}
                  height={32}
                  className="pixelated shrink-0 border border-border bg-black/40"
                  unoptimized
                />
              ) : (
                <span className="inline-block size-8 shrink-0 border border-border bg-muted/50" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                  {slot.label}
                </span>
                <span
                  className={cn(
                    "block truncate text-sm",
                    empty ? "text-muted-foreground/70" : "text-[#c9a0ff]"
                  )}
                >
                  {empty ? "Empty — select slot" : display.name}
                </span>
              </span>
            </button>
            {!empty ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => onClear(slot.slot)}
              >
                ✕
              </Button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function GearSetLegend({
  activeSets,
  partialSets,
}: {
  activeSets: SetStatus[]
  partialSets: SetStatus[]
}) {
  const rows = [
    ...activeSets.map((s) => ({ ...s, tone: "active" as const })),
    ...partialSets.slice(0, 8).map((s) => ({ ...s, tone: "partial" as const })),
  ]
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No equipment sets matched yet. Completing multi-piece sets applies their
        bonus once in the Set column.
      </p>
    )
  }
  return (
    <div className="border border-border bg-card/40 p-3">
      <h3 className="font-heading text-xs tracking-[0.14em] text-gold-dim uppercase">
        Equipment sets
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2 text-xs">
        {rows.map((s, idx) => (
          <li
            key={`${s.tone}-${s.id}`}
            className="border border-border px-2 py-1"
            style={{
              borderLeftWidth: 4,
              borderLeftColor:
                SET_HEADER_COLORS[idx % SET_HEADER_COLORS.length],
            }}
          >
            Set {s.id}{" "}
            <span className="text-muted-foreground">
              {s.matchedCount}/{s.requiredCount}
              {s.complete ? " · active" : " · partial"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
