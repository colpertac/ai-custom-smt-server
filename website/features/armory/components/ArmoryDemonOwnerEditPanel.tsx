"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { fetchDemonEditAccess, updateDemonReunion } from "@/features/armory/api"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { LevelSlider } from "@/features/armory/components/LevelSlider"
import { MitamaBranchSetsSidebar } from "@/features/armory/components/MitamaBranchSetsSidebar"
import type { DemonEditState } from "@/lib/demon-reunion-edit-shared"
import {
  MITAMA_RANK_MAX,
  MITAMA_REUNION_SLOT_COUNT,
  MITAMA_SLOTS_PER_BRANCH,
  MITAMA_SPIRIT_OPTIONS,
  MITAMA_TYPE_OPTIONS,
  REUNION_BRANCH_COUNT,
  REUNION_RANK_MAX,
  bonusIdForMitamaSpirit,
  clampMitamaSlotsToReunionRanks,
  getMitamaSpiritOption,
  getReunionBranchName,
  mitamaSlotsAvailableForRank,
  mitamaSpiritFromBonusId,
} from "@/lib/demon-reunion-edit-shared"
import {
  getGrowthTypeLabel,
  getRankedGrowthTypesByBranch,
} from "@/lib/growth-type-catalog"
import { cn } from "@/lib/utils"

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function cloneState(state: DemonEditState): DemonEditState {
  const reunion = [...state.reunion]
  return {
    ...state,
    reunion,
    mitamaReunion: clampMitamaSlotsToReunionRanks(
      [...state.mitamaReunion],
      reunion
    ),
  }
}

/** Count filled Mitama slots in one branch. */
function branchFilledCount(mitamaReunion: number[], branch: number): number {
  const start = branch * MITAMA_SLOTS_PER_BRANCH
  let n = 0
  for (let i = 0; i < MITAMA_SLOTS_PER_BRANCH; i++) {
    if (mitamaReunion[start + i]) n++
  }
  return n
}

export function ArmoryDemonOwnerEditPanel({ demonId }: { demonId: string }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accessQuery = useQuery({
    queryKey: ["armory", "demon-edit-access", demonId],
    queryFn: () => fetchDemonEditAccess(demonId),
    retry: false,
  })

  const saveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateDemonReunion>[1]) =>
      updateDemonReunion(demonId, payload),
    onSuccess: (data) => {
      setError(null)
      void queryClient.setQueryData(
        ["armory", "demon-edit-access", demonId],
        (prev: unknown) => {
          if (!prev || typeof prev !== "object") return prev
          return { ...prev, state: data.state, online: false }
        }
      )
      router.refresh()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Reunion update failed")
    },
  })

  if (accessQuery.isLoading) return null
  if (accessQuery.isError || !accessQuery.data?.canEdit) return null

  const { online, state } = accessQuery.data
  if (!state) return null

  const busy = saveMutation.isPending

  return (
    <section className="mb-6 border-2 border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
            Owner edit
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Change reunion ranks, mitama slots, mitama type/rank, and G-Type
            (growth path). Log out of the game client before saving.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            Edit
          </span>
          <Switch
            checked={editing}
            disabled={busy || online}
            onCheckedChange={setEditing}
            aria-label="Toggle demon reunion editor"
          />
        </div>
      </div>

      {online ? (
        <p className="mt-3 text-sm text-[#ff9b9b]">
          A character on this account is online — log out of the game, then
          refresh.
        </p>
      ) : null}
      {error ? (
        <div className="mt-3">
          <FormAlert>{error}</FormAlert>
        </div>
      ) : null}

      {editing && !online ? (
        <DemonReunionEditor
          key={`demon-${state.demonId}-${state.reunion.join(",")}-${state.mitamaReunion.join(",")}-${state.mitamaRank}-${state.mitamaType}-${state.growthType}`}
          state={state}
          busy={busy}
          onSave={(payload) => saveMutation.mutate(payload)}
        />
      ) : null}
    </section>
  )
}

function DemonReunionEditor({
  state,
  busy,
  onSave,
}: {
  state: DemonEditState
  busy: boolean
  onSave: (payload: {
    reunion: number[]
    mitamaReunion: number[]
    mitamaRank: number
    mitamaType: number
    growthType: number
  }) => void
}) {
  const [draft, setDraft] = useState(() => cloneState(state))
  const rankedGrowth = useMemo(() => getRankedGrowthTypesByBranch(), [])
  const rankedIds = useMemo(() => {
    const ids = new Set<number>()
    for (const branch of rankedGrowth) {
      for (const opt of branch.options) ids.add(opt.id)
    }
    return ids
  }, [rankedGrowth])
  const currentGrowthExtra = rankedIds.has(draft.growthType)
    ? null
    : {
        id: draft.growthType,
        label: getGrowthTypeLabel(draft.growthType),
      }

  const dirty = useMemo(() => {
    return (
      draft.mitamaRank !== state.mitamaRank ||
      draft.mitamaType !== state.mitamaType ||
      draft.growthType !== state.growthType ||
      !arraysEqual(draft.reunion, state.reunion) ||
      !arraysEqual(draft.mitamaReunion, state.mitamaReunion)
    )
  }, [draft, state])

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Mitama identity
        </h3>
        <Button
          type="button"
          size="sm"
          disabled={busy || !dirty}
          onClick={() =>
            onSave({
              reunion: draft.reunion,
              mitamaReunion: draft.mitamaReunion,
              mitamaRank: draft.mitamaRank,
              mitamaType: draft.mitamaType,
              growthType: draft.growthType,
            })
          }
        >
          {busy ? "Saving…" : "Save all"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border border-border/80 px-2.5 py-2 text-xs">
          <label className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Mitama type (M-Type)
          </label>
          <select
            className="mt-1.5 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            disabled={busy}
            value={draft.mitamaType}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                mitamaType: Number(e.target.value) || 0,
              }))
            }
          >
            {MITAMA_TYPE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="border border-border/80 px-2.5 py-2">
          <LevelSlider
            label="Mitama rank"
            value={draft.mitamaRank}
            min={0}
            max={MITAMA_RANK_MAX}
            disabled={busy}
            onChange={(mitamaRank) =>
              setDraft((prev) => ({ ...prev, mitamaRank }))
            }
          />
        </div>
        <div className="border border-border/80 px-2.5 py-2 text-xs sm:col-span-2">
          <label className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Growth type (G-Type)
          </label>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Active level-up path from the last reunion branch rebirth. Ranked
            options match in-game Tiwaz…Wyrd growth tables.
          </p>
          <select
            className="mt-1.5 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            disabled={busy}
            value={draft.growthType}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                growthType: Number(e.target.value) || 0,
              }))
            }
          >
            {currentGrowthExtra ? (
              <option value={currentGrowthExtra.id}>
                Current · {currentGrowthExtra.label} (id {currentGrowthExtra.id})
              </option>
            ) : null}
            {rankedGrowth.map((branch) => (
              <optgroup key={branch.branchIndex} label={branch.branchName}>
                {branch.options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name.trim()} · rank {opt.subID}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Reunion ranks
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                setDraft((prev) => {
                  const reunion = Array.from(
                    { length: REUNION_BRANCH_COUNT },
                    () => REUNION_RANK_MAX
                  )
                  return {
                    ...prev,
                    reunion,
                    mitamaReunion: clampMitamaSlotsToReunionRanks(
                      prev.mitamaReunion,
                      reunion
                    ),
                  }
                })
              }
            >
              Max all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                setDraft((prev) => {
                  const reunion = Array.from(
                    { length: REUNION_BRANCH_COUNT },
                    () => 0
                  )
                  return {
                    ...prev,
                    reunion,
                    mitamaReunion: clampMitamaSlotsToReunionRanks(
                      prev.mitamaReunion,
                      reunion
                    ),
                  }
                })
              }
            >
              Clear
            </Button>
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {draft.reunion.map((rank, i) => (
            <div
              key={i}
              className="border border-border/80 px-2.5 py-2 text-xs"
            >
              <LevelSlider
                label={getReunionBranchName(i)}
                value={rank}
                min={0}
                max={REUNION_RANK_MAX}
                disabled={busy}
                onChange={(next) =>
                  setDraft((prev) => {
                    const reunion = [...prev.reunion]
                    reunion[i] = next
                    return {
                      ...prev,
                      reunion,
                      mitamaReunion: clampMitamaSlotsToReunionRanks(
                        prev.mitamaReunion,
                        reunion
                      ),
                    }
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Mitama rebirth bar
            </h3>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Available slots follow each branch&apos;s reunion rank. Click a
              silver slot to pick Ara / Nigi / Kusi / Saki. Meeting a set recipe
              unlocks that effect (see View mitama bonuses).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MitamaBranchSetsSidebar />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  mitamaReunion: Array.from(
                    { length: MITAMA_REUNION_SLOT_COUNT },
                    () => 0
                  ),
                }))
              }
            >
              Clear all
            </Button>
          </div>
        </div>
        <div className="mt-2 space-y-3">
          {Array.from({ length: REUNION_BRANCH_COUNT }, (_, branch) => {
            const available = mitamaSlotsAvailableForRank(
              draft.reunion[branch] ?? 0
            )
            return (
              <MitamaBranchEditor
                key={branch}
                branch={branch}
                slots={draft.mitamaReunion.slice(
                  branch * MITAMA_SLOTS_PER_BRANCH,
                  branch * MITAMA_SLOTS_PER_BRANCH + MITAMA_SLOTS_PER_BRANCH
                )}
                availableSlots={available}
                filledCount={branchFilledCount(draft.mitamaReunion, branch)}
                disabled={busy}
                onSlotsChange={(slots) =>
                  setDraft((prev) => {
                    const mitamaReunion = [...prev.mitamaReunion]
                    const start = branch * MITAMA_SLOTS_PER_BRANCH
                    const cap = mitamaSlotsAvailableForRank(
                      prev.reunion[branch] ?? 0
                    )
                    for (let i = 0; i < MITAMA_SLOTS_PER_BRANCH; i++) {
                      mitamaReunion[start + i] = i < cap ? (slots[i] ?? 0) : 0
                    }
                    return { ...prev, mitamaReunion }
                  })
                }
                onClear={() =>
                  setDraft((prev) => {
                    const mitamaReunion = [...prev.mitamaReunion]
                    const start = branch * MITAMA_SLOTS_PER_BRANCH
                    for (let i = 0; i < MITAMA_SLOTS_PER_BRANCH; i++) {
                      mitamaReunion[start + i] = 0
                    }
                    return { ...prev, mitamaReunion }
                  })
                }
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MitamaBranchEditor({
  branch,
  slots,
  availableSlots,
  filledCount,
  disabled,
  onSlotsChange,
  onClear,
}: {
  branch: number
  slots: number[]
  availableSlots: number
  filledCount: number
  disabled: boolean
  onSlotsChange: (slots: number[]) => void
  onClear: () => void
}) {
  const locked = availableSlots <= 0
  const [openSlot, setOpenSlot] = useState<number | null>(null)

  return (
    <div
      className={cn(
        "border border-border/80 px-2.5 py-2 text-xs",
        locked && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-medium text-foreground">
            {getReunionBranchName(branch)}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {Math.min(filledCount, availableSlots)}/{availableSlots} slots
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px]"
          disabled={disabled || locked || filledCount === 0}
          onClick={onClear}
        >
          Clear
        </Button>
      </div>

      {locked ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Raise this branch&apos;s reunion rank to unlock Mitama slots.
        </p>
      ) : (
        <div className="mt-2 flex gap-1">
          {Array.from({ length: MITAMA_SLOTS_PER_BRANCH }, (_, i) => {
            const open = i < availableSlots
            const id = open ? (slots[i] ?? 0) : 0
            const spirit = open ? mitamaSpiritFromBonusId(id) : 0
            return (
              <MitamaBevelSlot
                key={i}
                slotIndex={i}
                spirit={spirit}
                unlocked={open}
                disabled={disabled || !open}
                menuOpen={openSlot === i}
                onMenuOpenChange={(next) => setOpenSlot(next ? i : null)}
                onPick={(nextSpirit) => {
                  const next = [...slots]
                  next[i] = bonusIdForMitamaSpirit(nextSpirit, id)
                  onSlotsChange(next)
                  setOpenSlot(null)
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Game-like silver-beveled slot with a colored custom dropdown. */
function MitamaBevelSlot({
  slotIndex,
  spirit,
  unlocked,
  disabled,
  menuOpen,
  onMenuOpenChange,
  onPick,
}: {
  slotIndex: number
  spirit: number
  unlocked: boolean
  disabled: boolean
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  onPick: (spirit: number) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const opt = getMitamaSpiritOption(spirit)
  const label =
    spirit > 0
      ? `${opt.short} (${opt.colorLabel})`
      : unlocked
        ? "Empty"
        : "Locked"

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onMenuOpenChange(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMenuOpenChange(false)
    }
    document.addEventListener("mousedown", onDoc)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      window.removeEventListener("keydown", onKey)
    }
  }, [menuOpen, onMenuOpenChange])

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
        aria-label={`Slot ${slotIndex + 1}: ${label}`}
        title={
          unlocked ? label : `Locked — need reunion rank ≥ ${slotIndex + 1}`
        }
        onClick={() => {
          if (disabled) return
          onMenuOpenChange(!menuOpen)
        }}
        className={cn(
          "mitama-bevel-slot group relative flex h-8 w-full items-center justify-center disabled:cursor-not-allowed",
          !unlocked && "opacity-35"
        )}
      >
        <span
          className="mitama-bevel-inner block h-[30px] w-[80%]"
          data-spirit={unlocked ? String(spirit) : "locked"}
        />
      </button>

      {menuOpen && unlocked ? (
        <ul
          role="listbox"
          className="absolute top-[calc(100%+4px)] left-1/2 z-30 min-w-[9.5rem] -translate-x-1/2 border border-border bg-card py-1 shadow-lg"
        >
          {MITAMA_SPIRIT_OPTIONS.map((o) => {
            const selected = spirit === o.id
            const itemLabel =
              o.id === 0 ? "Empty" : `${o.short} (${o.colorLabel})`
            return (
              <li key={o.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  data-spirit={String(o.id)}
                  className={cn(
                    "mitama-menu-swatch flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] font-medium hover:brightness-110",
                    selected && "ring-1 ring-gold-dim ring-inset"
                  )}
                  onClick={() => onPick(o.id)}
                >
                  <span
                    className="size-2.5 shrink-0 border border-black/25"
                    style={{
                      backgroundColor: o.id > 0 ? o.color : "transparent",
                    }}
                    aria-hidden
                  />
                  {itemLabel}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
