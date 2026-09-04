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
import { GearBuildsPanel } from "@/features/gear-planner/components/GearBuildsPanel"
import { GearCombatMatrix } from "@/features/gear-planner/components/GearCombatMatrix"
import { GearEnchantPicker } from "@/features/gear-planner/components/GearEnchantPicker"
import {
  GearRecommendTable,
  recommendHitToWikiItem,
  type RecommendHit,
} from "@/features/gear-planner/components/GearRecommendTable"
import { GearSlotSidebar } from "@/features/gear-planner/components/GearSlotSidebar"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EQUIP_SLOTS, type EquipSlotKey } from "@/lib/armory-equipment"
import {
  DEFAULT_PLANNER_ATTRS,
  SET_HEADER_COLORS,
  setColorIndexBySetId,
  setHeaderBackground,
  applyEnchantToSlot,
  applyArmoryEquipmentToSlot,
  applyLayerToSlot,
  canApplyEnchant,
  canApplyLayer,
  computeGearPlannerCombat,
  emptyPlannerLoadout,
  equipWikiItemOntoSlot,
  itemSubcategory,
  parsePlannerState,
  plannerSlotDisplay,
  serializePlannerState,
  type EnchantSide,
  type GearLayer,
  type PlannerAttrs,
  type PlannerLnc,
  type PlannerSlot,
  type PlannerStatKey,
  type SetStatus,
} from "@/lib/gear-planner-combat"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "imagine-gear-planner-v3"
const LEGACY_STORAGE_KEY = "imagine-gear-planner-v2"

export type PlannerGender = 0 | 1

function loadStored(): {
  loadout: PlannerSlot[]
  attrs: PlannerAttrs
  gender: PlannerGender
  lnc: PlannerLnc
  notes: string
} {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) {
      return {
        loadout: emptyPlannerLoadout(),
        attrs: { ...DEFAULT_PLANNER_ATTRS },
        gender: 0,
        lnc: 1,
        notes: "",
      }
    }
    return parsePlannerState(JSON.parse(raw))
  } catch {
    return {
      loadout: emptyPlannerLoadout(),
      attrs: { ...DEFAULT_PLANNER_ATTRS },
      gender: 0,
      lnc: 1,
      notes: "",
    }
  }
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

function persist(state: {
  loadout: PlannerSlot[]
  attrs: PlannerAttrs
  gender: PlannerGender
  lnc: PlannerLnc
  notes: string
}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(serializePlannerState(state))
  )
}

const ATTR_FIELDS: Array<{ key: keyof PlannerAttrs; label: string }> = [
  { key: "str", label: "STR" },
  { key: "magic", label: "MAG" },
  { key: "vit", label: "VIT" },
  { key: "intel", label: "INT" },
  { key: "speed", label: "SPD" },
  { key: "luck", label: "LUCK" },
  { key: "level", label: "Lv" },
]

export function GearPlannerApp({
  initialSharePayload,
}: {
  /** Shared build loaded from `/builder/s/[token]`. */
  initialSharePayload?: unknown
} = {}) {
  const isClient = useIsClient()
  if (!isClient) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Loading planner…
      </div>
    )
  }
  return <GearPlannerAppClient initialSharePayload={initialSharePayload} />
}

function GearPlannerAppClient({
  initialSharePayload,
}: {
  initialSharePayload?: unknown
}) {
  const accountBuildId = useMemo(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("build")
  }, [])

  const stored = useMemo(() => {
    if (initialSharePayload != null) {
      return parsePlannerState(initialSharePayload)
    }
    return loadStored()
  }, [initialSharePayload])

  const [loadout, setLoadout] = useState<PlannerSlot[]>(stored.loadout)
  const [attrs, setAttrs] = useState<PlannerAttrs>(stored.attrs)
  const [gender, setGender] = useState<PlannerGender>(stored.gender)
  const [lnc, setLnc] = useState<PlannerLnc>(stored.lnc)
  const [notes, setNotes] = useState(stored.notes)
  const [selectedSlot, setSelectedSlot] = useState<EquipSlotKey | null>(null)
  const [recommendStat, setRecommendStat] = useState<PlannerStatKey>("cooldown")
  const [recommendSlot, setRecommendSlot] = useState<EquipSlotKey | "">("")
  const [dropError, setDropError] = useState<string | null>(null)
  const [importName, setImportName] = useState("")
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [shareBanner] = useState(initialSharePayload != null)
  const [accountBuildMeta, setAccountBuildMeta] = useState<{
    id: string
    name: string
  } | null>(null)
  const [accountBuildError, setAccountBuildError] = useState<string | null>(
    null
  )
  const [fullStats, setFullStats] = useState(false)

  useEffect(() => {
    if (shareBanner) return
    persist({ loadout, attrs, gender, lnc, notes })
  }, [loadout, attrs, gender, lnc, notes, shareBanner])

  const combat = useMemo(
    () => computeGearPlannerCombat(loadout, attrs, lnc, { fullStats }),
    [loadout, attrs, lnc, fullStats]
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

  const applyStored = useCallback(
    (payload: unknown) => {
      const next = parsePlannerState(payload)
      setLoadout(next.loadout)
      setAttrs(next.attrs)
      setGender(next.gender)
      setLnc(next.lnc)
      setNotes(next.notes)
      setDropError(null)
    },
    []
  )

  useEffect(() => {
    if (!accountBuildId || initialSharePayload != null) return
    let cancelled = false
    fetch(`/api/builder/builds/${encodeURIComponent(accountBuildId)}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          data?: { id: string; name: string; payload: unknown }
          message?: string
        }
        if (cancelled) return
        if (!res.ok || !json.data?.payload) {
          setAccountBuildError(json.message ?? "Could not load that build")
          return
        }
        applyStored(json.data.payload)
        setAccountBuildMeta({ id: json.data.id, name: json.data.name })
        window.history.replaceState({}, "", "/builder")
      })
      .catch(() => {
        if (!cancelled) setAccountBuildError("Could not load that build")
      })
    return () => {
      cancelled = true
    }
  }, [accountBuildId, initialSharePayload, applyStored])

  const clearAll = useCallback(() => {
    setLoadout(emptyPlannerLoadout())
    setAttrs({ ...DEFAULT_PLANNER_ATTRS })
    setLnc(1)
    setNotes("")
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
      const json = (await res.json()) as {
        success?: boolean
        data?: {
          equipment: Array<{
            slot: EquipSlotKey
            itemType: number | null
            basicEffect: number
            specialEffect: number
            tarot?: number
            soul?: number
          }>
          appearance?: { gender?: number }
          stats?: {
            level?: number
            str?: number
            magic?: number
            vit?: number
            intel?: number
            speed?: number
            luck?: number
          }
        }
      }
      const profile = json.data
      if (!profile?.equipment) {
        setImportError("Import failed")
        return
      }
      setLoadout(
        emptyPlannerLoadout().map((slot) => {
          const src = profile.equipment.find((e) => e.slot === slot.slot)
          if (!src) return slot
          return applyArmoryEquipmentToSlot(slot, src)
        })
      )
      const g = profile.appearance?.gender
      if (g === 0 || g === 1) setGender(g)
      if (profile.stats) {
        setAttrs((a) => ({
          str: profile.stats?.str ?? a.str,
          magic: profile.stats?.magic ?? a.magic,
          vit: profile.stats?.vit ?? a.vit,
          intel: profile.stats?.intel ?? a.intel,
          speed: profile.stats?.speed ?? a.speed,
          luck: profile.stats?.luck ?? a.luck,
          level: profile.stats?.level ?? a.level,
        }))
      }
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

  const handleDropEnchant = useCallback(
    (enchantId: number, side: EnchantSide) => {
      if (!selectedSlot || !selectedEquip) return
      const check = canApplyEnchant({
        target: selectedEquip,
        enchantId,
        side,
      })
      if (!check.ok) {
        setDropError(check.reason ?? "Cannot apply fusion")
        return
      }
      setDropError(null)
      setLoadout((prev) =>
        applyEnchantToSlot(prev, selectedSlot, side, enchantId)
      )
    },
    [selectedSlot, selectedEquip]
  )

  const currentPayload = useMemo(
    () =>
      serializePlannerState({
        loadout,
        attrs,
        gender,
        lnc,
        notes,
      }),
    [loadout, attrs, gender, lnc, notes]
  )

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
        <div className="space-y-4">
          {shareBanner ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs">
              <p>Viewing a shared build (not auto-saved to this browser).</p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => {
                  localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(currentPayload)
                  )
                  window.location.href = "/builder"
                }}
              >
                Copy to my draft
              </Button>
            </div>
          ) : null}

          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-[0.1em] uppercase sm:text-3xl">
                Gear builder
              </h1>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
                S1–S3, Tarot (T), and Soul (S). Drag or double-click recommend /
                fusion rows onto the open sidebar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <div className="flex items-center gap-1 border border-border p-1">
                {(
                  [
                    [0, "Law"],
                    [1, "Neutral"],
                    [2, "Chaos"],
                  ] as const
                ).map(([v, label]) => (
                  <Button
                    key={v}
                    type="button"
                    size="xs"
                    variant={lnc === v ? "default" : "ghost"}
                    onClick={() => setLnc(v)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </header>

          <GearBuildsPanel
            payload={currentPayload}
            onLoad={applyStored}
            initialActive={accountBuildMeta}
          />
          {accountBuildError ? (
            <p className="text-xs text-destructive">{accountBuildError}</p>
          ) : null}

          <div className="flex flex-wrap items-end gap-2 border border-border bg-card/40 p-3">
            {ATTR_FIELDS.map((f) => (
              <Field key={f.key} className="w-[4.5rem]">
                <FieldLabel htmlFor={`gp-${f.key}`}>{f.label}</FieldLabel>
                <Input
                  id={`gp-${f.key}`}
                  type="number"
                  className="h-8 px-1.5 text-xs"
                  value={attrs[f.key]}
                  onChange={(e) =>
                    setAttrs((a) => ({
                      ...a,
                      [f.key]: Number(e.target.value) || 0,
                    }))
                  }
                />
              </Field>
            ))}
            <Field className="min-w-[12rem] flex-1">
              <FieldLabel htmlFor="gp-import">Import from armory</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="gp-import"
                  className="h-8 text-xs"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="Character name"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  size="sm"
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
            <Button type="button" size="sm" variant="outline" onClick={clearAll}>
              Clear
            </Button>
          </div>

          <Field>
            <FieldLabel htmlFor="gp-notes">Build notes</FieldLabel>
            <Textarea
              id="gp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Expertise ranks, best summoned demons, playstyle tips… (not used in math)"
              className="min-h-[4rem] text-xs"
            />
          </Field>

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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-xs tracking-[0.14em] text-gold-dim uppercase">
              Combat matrix
            </h3>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch
                size="sm"
                checked={fullStats}
                onCheckedChange={setFullStats}
              />
              <span>Full stats</span>
            </label>
          </div>

          <GearCombatMatrix
            loadout={loadout}
            combat={combat}
            attrs={attrs}
            fullStats={fullStats}
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

          <div className="grid gap-3 xl:grid-cols-2">
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
            <GearEnchantPicker
              stat={recommendStat}
              attrs={attrs}
              lnc={lnc}
              enabled={Boolean(selectedEquip?.s1ItemId)}
              onApply={handleDropEnchant}
            />
          </div>
        </div>
      </div>

      {selectedSlot && selectedEquip ? (
        <div className="hidden h-full min-h-0 w-[min(100%,24rem)] shrink-0 lg:block xl:w-[28rem]">
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
            onDropEnchant={handleDropEnchant}
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
            onDropEnchant={handleDropEnchant}
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
  const colorBySet = setColorIndexBySetId([...activeSets, ...partialSets])
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
        {rows.map((s) => {
          const colorIdx = colorBySet.get(s.id) ?? 0
          const color =
            SET_HEADER_COLORS[colorIdx % SET_HEADER_COLORS.length] ?? "#888"
          return (
            <li
              key={`${s.tone}-${s.id}`}
              className="border border-border px-2 py-1 text-white"
              style={{
                backgroundColor: setHeaderBackground(color, 0.55),
                borderLeftWidth: 4,
                borderLeftColor: color,
              }}
            >
              Set {s.id}{" "}
              <span className="text-white/90">
                {s.matchedCount}/{s.requiredCount}
                {s.complete ? " · active" : " · partial"}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
