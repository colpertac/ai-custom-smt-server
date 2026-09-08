"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Plus, Settings2, TriangleAlert } from "lucide-react"

import {
  downloadAdminPayoutsZipAll,
  fetchAdminPayout,
} from "@/features/admin-payouts/api"
import { CpPresetsManageDialog } from "@/features/admin-payouts/components/CpPresetsManageDialog"
import { FamilyWeightsDialog } from "@/features/admin-payouts/components/FamilyWeightsDialog"
import { PayoutDetailDrawer } from "@/features/admin-payouts/components/PayoutDetailDrawer"
import { applyEconomyPreset } from "@/features/admin-payouts/cpPresets"
import {
  groupPayoutsByFamily,
  variantDisplayLabel,
  type SheetDifficulty,
} from "@/features/admin-payouts/groupPayouts"
import {
  applyWeightedEconomy,
  familyWeightOf,
  weightedCp,
} from "@/features/admin-payouts/payout-weights"
import {
  useAdminCpPresets,
  useAdminFamilyWeights,
  useAdminPayoutConflicts,
  useAdminPayouts,
  useBatchSaveAdminPayoutCp,
  useBatchSaveAdminPayoutWeights,
  useCreateAdminPayout,
  useDeleteAdminPayout,
  useRetireAdminPayoutConflictPackages,
  useSaveAdminFamilyWeights,
  useSaveAdminPayout,
} from "@/features/admin-payouts/hooks"
import { useConfirm } from "@/components/confirm-dialog"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { EconomyPreset } from "@/lib/cp-presets-store"
import { FAMILY_WEIGHTS_SCHEMA_VERSION } from "@/lib/dungeon-payout-types"
import type {
  DungeonPayoutFile,
  FamilyWeightsFile,
  PayoutListItem,
} from "@/lib/dungeon-payout-types"

const TIERS: { key: SheetDifficulty; label: string; headClass: string }[] = [
  {
    key: "bronze",
    label: "Bronze",
    headClass: "bg-[#3d2a1a]/80 text-[#e8c49a]",
  },
  {
    key: "silver",
    label: "Silver",
    headClass: "bg-[#2a2e34]/90 text-[#c8d0d8]",
  },
  {
    key: "gold",
    label: "Gold",
    headClass: "bg-[#3a3218]/90 text-[#e6d090]",
  },
]

function fingerprint(file: DungeonPayoutFile): string {
  return JSON.stringify(file)
}

function displayCp(
  item: PayoutListItem | undefined,
  cpOverrides: Record<string, number>
): number | null {
  if (!item) return null
  return cpOverrides[item.id] ?? item.cp
}

function isCpDirty(
  item: PayoutListItem | undefined,
  cpOverrides: Record<string, number>
): boolean {
  if (!item) return false
  return (
    Object.prototype.hasOwnProperty.call(cpOverrides, item.id) &&
    cpOverrides[item.id] !== item.cp
  )
}

function displayWeight(
  item: PayoutListItem | undefined,
  weightOverrides: Record<string, number>
): number | null {
  if (!item) return null
  return weightOverrides[item.id] ?? item.cpWeight ?? 1
}

function isWeightDirty(
  item: PayoutListItem | undefined,
  weightOverrides: Record<string, number>
): boolean {
  if (!item) return false
  return (
    Object.prototype.hasOwnProperty.call(weightOverrides, item.id) &&
    weightOverrides[item.id] !== (item.cpWeight ?? 1)
  )
}

export function DungeonPayoutsPanel() {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { data: list, isLoading, isError, error } = useAdminPayouts()
  const { data: conflictData } = useAdminPayoutConflicts()
  const retireConflicts = useRetireAdminPayoutConflictPackages()
  const { data: cpPresets = [] } = useAdminCpPresets()
  const { data: familyWeightsFile } = useAdminFamilyWeights()
  const liveConflicts = conflictData?.conflicts ?? []
  const createMutation = useCreateAdminPayout()
  const saveMutation = useSaveAdminPayout()
  const batchCpMutation = useBatchSaveAdminPayoutCp()
  const batchWeightsMutation = useBatchSaveAdminPayoutWeights()
  const saveFamilyWeightsMutation = useSaveAdminFamilyWeights()
  const deleteMutation = useDeleteAdminPayout()

  const [filter, setFilter] = useState("")
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [cpOverrides, setCpOverrides] = useState<Record<string, number>>({})
  const [weightOverrides, setWeightOverrides] = useState<
    Record<string, number>
  >({})
  const [familyWeightOverrides, setFamilyWeightOverrides] = useState<
    Record<string, number>
  >({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DungeonPayoutFile | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newId, setNewId] = useState("")
  const [newName, setNewName] = useState("")
  const [newInstanceId, setNewInstanceId] = useState("5402")
  const [batchError, setBatchError] = useState<string | null>(null)
  const [retireOk, setRetireOk] = useState(false)
  const [exportAllPending, setExportAllPending] = useState(false)
  const [presetsManageOpen, setPresetsManageOpen] = useState(false)
  const [familyWeightsOpen, setFamilyWeightsOpen] = useState(false)

  const draftRef = useRef(draft)
  const cpOverridesRef = useRef(cpOverrides)
  const weightOverridesRef = useRef(weightOverrides)
  const familyWeightOverridesRef = useRef(familyWeightOverrides)
  const flushInFlightRef = useRef(false)
  /** Preset/recalculate flush — avoid overlapping batch saves. */
  const skipAutoSaveRef = useRef(false)
  draftRef.current = draft
  cpOverridesRef.current = cpOverrides
  weightOverridesRef.current = weightOverrides
  familyWeightOverridesRef.current = familyWeightOverrides

  const savedFamilyWeights = familyWeightsFile?.weights ?? {}

  /** Weight recalculate always uses Grindy tier bases (Normal/Generous are linear scales). */
  const grindyPreset = useMemo(
    () => cpPresets.find((p) => p.id === "grindy") ?? cpPresets[0],
    [cpPresets]
  )

  const dirtyDrawer = useMemo(() => {
    if (!draft || baseline == null) return false
    return fingerprint(draft) !== baseline
  }, [draft, baseline])

  const dirtyCpIds = useMemo(
    () =>
      Object.keys(cpOverrides).filter((id) => {
        const row = list?.find((p) => p.id === id)
        return row != null && cpOverrides[id] !== row.cp
      }),
    [cpOverrides, list]
  )

  const dirtyWeightIds = useMemo(
    () =>
      Object.keys(weightOverrides).filter((id) => {
        const row = list?.find((p) => p.id === id)
        return row != null && weightOverrides[id] !== (row.cpWeight ?? 1)
      }),
    [weightOverrides, list]
  )

  const dirtyFamilyKeys = useMemo(
    () =>
      Object.keys(familyWeightOverrides).filter((family) => {
        const saved = familyWeightOf(savedFamilyWeights, family)
        return familyWeightOverrides[family] !== saved
      }),
    [familyWeightOverrides, savedFamilyWeights]
  )

  const anyDirty =
    dirtyDrawer ||
    dirtyCpIds.length > 0 ||
    dirtyWeightIds.length > 0 ||
    dirtyFamilyKeys.length > 0
  const saving =
    saveMutation.isPending ||
    batchCpMutation.isPending ||
    batchWeightsMutation.isPending ||
    saveFamilyWeightsMutation.isPending ||
    flushInFlightRef.current
  const dirtyRef = useRef(false)
  useEffect(() => {
    dirtyRef.current = anyDirty || saving
  }, [anyDirty, saving])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  const flushPendingChanges = useCallback(async () => {
    if (flushInFlightRef.current) return

    const currentDraft = draftRef.current
    const currentCpOverrides = cpOverridesRef.current
    const currentWeightOverrides = weightOverridesRef.current
    const currentFamilyWeightOverrides = familyWeightOverridesRef.current
    const cpDirty = Object.keys(currentCpOverrides).filter((id) => {
      const row = list?.find((p) => p.id === id)
      return row != null && currentCpOverrides[id] !== row.cp
    })
    const weightDirty = Object.keys(currentWeightOverrides).filter((id) => {
      const row = list?.find((p) => p.id === id)
      return (
        row != null && currentWeightOverrides[id] !== (row.cpWeight ?? 1)
      )
    })
    const familyDirty = Object.keys(currentFamilyWeightOverrides).filter(
      (family) => {
        const saved = familyWeightOf(savedFamilyWeights, family)
        return currentFamilyWeightOverrides[family] !== saved
      }
    )
    const drawerDirty =
      currentDraft &&
      baseline != null &&
      fingerprint(currentDraft) !== baseline

    if (
      cpDirty.length === 0 &&
      weightDirty.length === 0 &&
      familyDirty.length === 0 &&
      !drawerDirty
    ) {
      return
    }

    flushInFlightRef.current = true
    setBatchError(null)
    try {
      const drawerId =
        drawerDirty && currentDraft ? currentDraft.payout.id : null
      const cpUpdates = cpDirty
        .filter((id) => id !== drawerId)
        .map((id) => ({ id, cp: currentCpOverrides[id]! }))
      const weightUpdates = weightDirty
        .filter((id) => id !== drawerId)
        .map((id) => ({ id, cpWeight: currentWeightOverrides[id]! }))

      if (cpUpdates.length > 0) {
        await batchCpMutation.mutateAsync(cpUpdates)
        const cpById = new Map(cpUpdates.map((u) => [u.id, u.cp]))
        queryClient.setQueryData<PayoutListItem[]>(
          ["admin", "payouts"],
          (prev) =>
            prev?.map((row) =>
              cpById.has(row.id) ? { ...row, cp: cpById.get(row.id)! } : row
            )
        )
      }
      if (weightUpdates.length > 0) {
        await batchWeightsMutation.mutateAsync(weightUpdates)
        const wById = new Map(weightUpdates.map((u) => [u.id, u.cpWeight]))
        queryClient.setQueryData<PayoutListItem[]>(
          ["admin", "payouts"],
          (prev) =>
            prev?.map((row) =>
              wById.has(row.id)
                ? { ...row, cpWeight: wById.get(row.id)! }
                : row
            )
        )
      }
      if (familyDirty.length > 0) {
        const nextWeights = { ...savedFamilyWeights }
        for (const family of familyDirty) {
          const w = currentFamilyWeightOverrides[family]!
          if (w === 1) {
            delete nextWeights[family]
          } else {
            nextWeights[family] = w
          }
        }
        const savedFile: FamilyWeightsFile = {
          version: FAMILY_WEIGHTS_SCHEMA_VERSION,
          weights: nextWeights,
        }
        await saveFamilyWeightsMutation.mutateAsync(savedFile)
        queryClient.setQueryData<FamilyWeightsFile>(
          ["admin", "payouts", "family-weights"],
          savedFile
        )
        setFamilyWeightOverrides((prev) => {
          const next = { ...prev }
          for (const family of familyDirty) delete next[family]
          return next
        })
      }
      if (drawerDirty && currentDraft) {
        await saveMutation.mutateAsync({
          id: currentDraft.payout.id,
          body: currentDraft,
        })
        setBaseline(fingerprint(currentDraft))
        queryClient.setQueryData<PayoutListItem[]>(
          ["admin", "payouts"],
          (prev) =>
            prev?.map((row) =>
              row.id === currentDraft.payout.id
                ? {
                    ...row,
                    cp: currentDraft.payout.cp,
                    cpWeight: currentDraft.payout.cpWeight ?? 1,
                    name: currentDraft.payout.name,
                    enabled: currentDraft.payout.enabled,
                  }
                : row
            )
        )
      }

      const savedIds = new Set([
        ...cpUpdates.map((u) => u.id),
        ...weightUpdates.map((u) => u.id),
        ...(drawerId ? [drawerId] : []),
      ])
      setCpOverrides((prev) => {
        const next = { ...prev }
        for (const id of savedIds) {
          if (Object.prototype.hasOwnProperty.call(currentCpOverrides, id)) {
            delete next[id]
          }
        }
        return next
      })
      setWeightOverrides((prev) => {
        const next = { ...prev }
        for (const id of savedIds) {
          if (
            Object.prototype.hasOwnProperty.call(currentWeightOverrides, id)
          ) {
            delete next[id]
          }
        }
        return next
      })
      saveMutation.reset()
      batchCpMutation.reset()
      batchWeightsMutation.reset()
      saveFamilyWeightsMutation.reset()
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Save failed")
      throw err
    } finally {
      flushInFlightRef.current = false
    }
  }, [
    baseline,
    batchCpMutation,
    batchWeightsMutation,
    list,
    queryClient,
    saveFamilyWeightsMutation,
    saveMutation,
    savedFamilyWeights,
  ])

  const openPayout = useCallback(
    async (id: string) => {
      if (id === selectedId) return
      try {
        await flushPendingChanges()
      } catch {
        return
      }
      setSelectedId(id)
      saveMutation.reset()
      try {
        const file = await fetchAdminPayout(id)
        setDraft(structuredClone(file))
        setBaseline(fingerprint(file))
      } catch (err) {
        setDraft(null)
        setBaseline(null)
        setBatchError(
          err instanceof Error ? err.message : "Failed to load payout"
        )
      }
    },
    [selectedId, flushPendingChanges, saveMutation]
  )

  const filteredList = useMemo(() => {
    let rows = list ?? []
    if (enabledOnly) rows = rows.filter((r) => r.enabled)
    const q = filter.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.family?.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.id.includes(q) ||
          String(r.instanceId).includes(q)
      )
    }
    return rows
  }, [list, filter, enabledOnly])

  const selectedListItem = useMemo(
    () => list?.find((p) => p.id === selectedId) ?? null,
    [list, selectedId]
  )

  const familyRows = useMemo(
    () => groupPayoutsByFamily(filteredList),
    [filteredList]
  )

  const allFamilyNames = useMemo(
    () => groupPayoutsByFamily(list ?? []).map((r) => r.family),
    [list]
  )

  const setCp = (item: PayoutListItem, value: number) => {
    setCpOverrides((prev) => ({ ...prev, [item.id]: value }))
    if (draft?.payout.id === item.id) {
      setDraft({
        ...draft,
        payout: { ...draft.payout, cp: value },
      })
    }
  }

  const setFamilyWeight = (family: string, value: number) => {
    setFamilyWeightOverrides((prev) => ({ ...prev, [family]: value }))
  }

  const effectiveFamilyWeights = useMemo(() => {
    return { ...savedFamilyWeights, ...familyWeightOverrides }
  }, [savedFamilyWeights, familyWeightOverrides])

  const applyPreset = (preset: EconomyPreset) => {
    void (async () => {
      const rows = list ?? []
      if (!rows.length) return
      const sheetNote =
        preset.id === "grindy" ||
        preset.id === "normal" ||
        preset.id === "generous"
          ? "\n\nUses per-dungeon sheet values where defined; other payouts use global tier fallbacks."
          : ""
      const ok = await confirm({
        title: `Apply “${preset.label}” preset?`,
        description:
          `Apply to all ${rows.length} payouts.\n\n` +
          `Bronze ${preset.bronze} · Silver ${preset.silver} · Gold ${preset.gold}` +
          ` (bearcat ×${preset.bearcatMult}, diaspora ${preset.diaspora}).` +
          sheetNote,
        confirmLabel: "Apply preset",
      })
      if (!ok) return
      try {
        await flushPendingChanges()
      } catch {
        return
      }
      const next = applyEconomyPreset(rows, preset)
      let nextDraft = draft
      if (draft && next[draft.payout.id] != null) {
        nextDraft = {
          ...draft,
          payout: { ...draft.payout, cp: next[draft.payout.id] },
        }
        setDraft(nextDraft)
      }
      skipAutoSaveRef.current = true
      setCpOverrides(next)
      draftRef.current = nextDraft
      cpOverridesRef.current = next
      try {
        await flushPendingChanges()
      } catch {
        // flushPendingChanges already surfaced the error
      } finally {
        skipAutoSaveRef.current = false
      }
    })()
  }

  const recalculateFromWeights = () => {
    void (async () => {
      const rows = list ?? []
      if (!rows.length) return
      const preset = grindyPreset
      if (!preset) {
        setBatchError("No CP presets available for weight recalculate")
        return
      }
      const ok = await confirm({
        title: `Recalculate CP from weights?`,
        description:
          `Fill CP for all ${rows.length} payouts using Grindy tier bases × weights:\n\n` +
          `CP = tierBase × familyWeight × payoutWeight\n\n` +
          `Bronze ${preset.bronze} · Silver ${preset.silver} · Gold ${preset.gold}` +
          ` (bearcat ×${preset.bearcatMult}). Use Normal/Generous presets afterward if you want a global scale. Manual CP edits remain possible.`,
        confirmLabel: "Recalculate",
      })
      if (!ok) return
      try {
        await flushPendingChanges()
      } catch {
        return
      }
      const weightedRows = rows.map((r) => ({
        ...r,
        cpWeight: weightOverrides[r.id] ?? r.cpWeight ?? 1,
      }))
      const next = applyWeightedEconomy(
        weightedRows,
        preset,
        effectiveFamilyWeights
      )
      let nextDraft = draft
      if (draft && next[draft.payout.id] != null) {
        nextDraft = {
          ...draft,
          payout: { ...draft.payout, cp: next[draft.payout.id] },
        }
        setDraft(nextDraft)
      }
      skipAutoSaveRef.current = true
      setCpOverrides(next)
      draftRef.current = nextDraft
      cpOverridesRef.current = next
      try {
        await flushPendingChanges()
      } catch {
        // already surfaced
      } finally {
        skipAutoSaveRef.current = false
      }
    })()
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading payouts…</p>
  }
  if (isError) {
    return (
      <p className="mt-8 text-sm font-medium text-[#ff9b9b]">
        {error instanceof Error ? error.message : "Failed to load payouts"}
      </p>
    )
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="space-y-3 border-2 border-border bg-muted/20 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="min-w-[12rem] flex-1">
            <FieldLabel htmlFor="sheet-filter">Filter</FieldLabel>
            <Input
              id="sheet-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="family, name, id…"
            />
          </Field>
          <label className="flex items-center gap-2 pb-1 text-sm">
            <input
              type="checkbox"
              checked={enabledOnly}
              onChange={(e) => setEnabledOnly(e.target.checked)}
            />
            Enabled only
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const next: Record<string, boolean> = {}
              for (const r of familyRows) next[r.family] = true
              setExpanded(next)
            }}
          >
            Expand variants
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setExpanded({})}
          >
            Collapse
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={exportAllPending || saving}
            onClick={() => {
              void (async () => {
                try {
                  await flushPendingChanges()
                } catch {
                  return
                }
                setExportAllPending(true)
                setBatchError(null)
                try {
                  await downloadAdminPayoutsZipAll()
                } catch (err) {
                  setBatchError(
                    err instanceof Error
                      ? err.message
                      : "Failed to download all payouts"
                  )
                } finally {
                  setExportAllPending(false)
                }
              })()
            }}
          >
            {exportAllPending ? "Downloading…" : "Download all (zip)"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus data-icon="inline-start" />
            Add payout
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
          <span className="mr-1 text-xs tracking-wide text-muted-foreground uppercase">
            CP presets
          </span>
          {cpPresets.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant="outline"
              title={p.blurb || p.label}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title="Manage CP presets"
            onClick={() => setPresetsManageOpen(true)}
          >
            <Settings2 data-icon="inline-start" />
            Manage
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="mr-1 text-xs tracking-wide text-muted-foreground uppercase">
            Family weights
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void (async () => {
                try {
                  await flushPendingChanges()
                } catch {
                  return
                }
                setFamilyWeightsOpen(true)
              })()
            }}
          >
            Manage weights
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!list?.length || !grindyPreset || saving}
            onClick={() => recalculateFromWeights()}
          >
            Recalculate from weights
          </Button>
          <p className="text-[0.65rem] text-muted-foreground">
            CP presets = global bases · family × = dungeon amp · preview →N
          </p>
        </div>
      </div>

      <CpPresetsManageDialog
        open={presetsManageOpen}
        onOpenChange={setPresetsManageOpen}
        presets={cpPresets}
      />

      <FamilyWeightsDialog
        open={familyWeightsOpen}
        onOpenChange={setFamilyWeightsOpen}
        families={allFamilyNames}
        savedWeights={savedFamilyWeights}
        onSaved={() => setFamilyWeightOverrides({})}
      />
      {liveConflicts.length > 0 ? (
        <FormAlert
          variant="warning"
          className="flex flex-col gap-2 border-orange-500/70 bg-orange-950/45 text-orange-100"
        >
          <div className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-orange-400"
              aria-hidden
            />
            <span>
              {liveConflicts.length} enabled payout(s) conflict with another live
              package (DropSet or event IDs). Publish will fail until those
              packages are retired — otherwise CP/loot edits never go live.
            </span>
          </div>
          <ul className="list-disc space-y-0.5 pl-6 text-xs text-orange-100/90">
            {liveConflicts.map((c) => (
              <li key={c.payoutId}>
                <span className="font-medium text-orange-50">{c.payoutId}</span>
                {c.dropSetPackages.length
                  ? ` — DropSet ${c.dropSetId} in ${c.dropSetPackages.join(", ")}`
                  : ""}
                {c.eventPackages.length
                  ? ` — events in ${c.eventPackages.join(", ")}`
                  : ""}
              </li>
            ))}
          </ul>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-orange-400/50 bg-orange-500/10 text-orange-50 hover:bg-orange-500/20"
              disabled={retireConflicts.isPending}
              onClick={() => {
                void (async () => {
                  const ok = await confirm({
                    title: "Retire blocking packages?",
                    description:
                      "Renames conflicting zips under datastore/packages/ (adds .disabled-by-lane-a-…). Then Validate & Publish shops & payouts on Overview and restart the channel.",
                    confirmLabel: "Retire packages",
                  })
                  if (!ok) return
                  try {
                    await retireConflicts.mutateAsync()
                    setRetireOk(true)
                    setBatchError(null)
                  } catch (err) {
                    setRetireOk(false)
                    setBatchError(
                      err instanceof Error
                        ? err.message
                        : "Failed to retire packages"
                    )
                  }
                })()
              }}
            >
              {retireConflicts.isPending
                ? "Retiring…"
                : "Retire blocking packages"}
            </Button>
          </div>
        </FormAlert>
      ) : null}

      {batchError && <FormAlert variant="error">{batchError}</FormAlert>}
      {retireOk && liveConflicts.length === 0 ? (
        <FormAlert variant="success">
          Blocking packages retired. On Overview: Validate → Publish &amp; restart
          so the channel loads the admin payout zip.
        </FormAlert>
      ) : null}

      {showCreate && (
        <div className="space-y-2 border-2 border-border p-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            New payout
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-40"
              placeholder="kebab-id"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
            />
            <Input
              className="w-48"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              className="w-28"
              type="number"
              placeholder="Instance"
              value={newInstanceId}
              onChange={(e) => setNewInstanceId(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={createMutation.isPending}
              onClick={() => {
                void (async () => {
                  try {
                    await flushPendingChanges()
                  } catch {
                    return
                  }
                  const id = newId.trim()
                  const name = newName.trim()
                  const instanceId = Number.parseInt(newInstanceId, 10)
                  if (!id || !name || !Number.isInteger(instanceId)) return
                  createMutation.mutate(
                    { id, name, instanceId },
                    {
                      onSuccess: (data) => {
                        setShowCreate(false)
                        setNewId("")
                        setNewName("")
                        void openPayout(data.id)
                      },
                    }
                  )
                })()
              }}
            >
              Create
            </Button>
          </div>
          {createMutation.isError && (
            <FormAlert variant="error">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Create failed"}
            </FormAlert>
          )}
        </div>
      )}

      <div className="overflow-x-auto border-2 border-border">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 border-2 border-border bg-card px-2 py-2 text-left text-xs font-semibold tracking-wide uppercase">
                Dungeon
              </th>
              {TIERS.map((t) => (
                <th
                  key={t.key}
                  className={`border-2 border-border px-2 py-2 text-center text-xs font-semibold tracking-wide uppercase ${t.headClass}`}
                >
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {familyRows.map((row) => {
              const open = Boolean(expanded[row.family])
              const hasVariants = row.variants.length > 0
              return (
                <FamilyBlock
                  key={row.family}
                  family={row.family}
                  bronze={row.bronze}
                  silver={row.silver}
                  gold={row.gold}
                  variants={row.variants}
                  expanded={open}
                  hasVariants={hasVariants}
                  cpOverrides={cpOverrides}
                  weightOverrides={weightOverrides}
                  familyWeight={
                    familyWeightOverrides[row.family] ??
                    familyWeightOf(savedFamilyWeights, row.family)
                  }
                  familyWeightDirty={dirtyFamilyKeys.includes(row.family)}
                  grindyPreset={grindyPreset}
                  onToggle={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [row.family]: !prev[row.family],
                    }))
                  }
                  onAdvanced={(id) => void openPayout(id)}
                  onCp={setCp}
                  onFamilyWeight={setFamilyWeight}
                  onFlushBlur={() => {
                    void flushPendingChanges()
                  }}
                />
              )
            })}
            {!familyRows.length && (
              <tr>
                <td
                  colSpan={4}
                  className="border-2 border-border px-3 py-6 text-center text-muted-foreground"
                >
                  No payouts match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[0.65rem] text-muted-foreground">
        Edit CP cells manually anytime (saves when the field loses focus). Family
        × amps all ranks on Recalculate (Grindy bases × family × optional drawer
        payout weight). Manage CP presets = global bases; Manage weights =
        dungeon amp. Gear = advanced (enable, clear grants, per-payout weight,
        export).
      </p>

      <Dialog
        open={draft != null}
        onOpenChange={(open) => {
          if (open) return
          void (async () => {
            try {
              await flushPendingChanges()
            } catch {
              return
            }
            setSelectedId(null)
            setDraft(null)
            setBaseline(null)
          })()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>Advanced payout</DialogTitle>
            <DialogDescription>
              Enable, clear grants, notes, and export for this dungeon payout.
            </DialogDescription>
          </DialogHeader>
          <PayoutDetailDrawer
            draft={draft}
            listItem={selectedListItem}
            isDirty={dirtyDrawer}
            savePending={saving}
            deletePending={deleteMutation.isPending}
            saveError={
              saveMutation.isError
                ? saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Save failed"
                : null
            }
            saveOk={saveMutation.isSuccess}
            onChange={(next) => {
              setDraft(next)
              setCpOverrides((prev) => ({
                ...prev,
                [next.payout.id]: next.payout.cp,
              }))
              setWeightOverrides((prev) => ({
                ...prev,
                [next.payout.id]: next.payout.cpWeight ?? 1,
              }))
            }}
            onFlushSave={flushPendingChanges}
            onDelete={() => {
              if (!draft) return
              void (async () => {
                const ok = await confirm({
                  title: "Delete this payout?",
                  description: `Working-copy payout ${draft.payout.id} will be removed.`,
                  confirmLabel: "Delete",
                  variant: "destructive",
                })
                if (!ok) return
                deleteMutation.mutate(draft.payout.id, {
                  onSuccess: () => {
                    setSelectedId(null)
                    setDraft(null)
                    setBaseline(null)
                    setCpOverrides((prev) => {
                      const next = { ...prev }
                      delete next[draft.payout.id]
                      return next
                    })
                  },
                })
              })()
            }}
            onClearSelection={() => {
              void (async () => {
                try {
                  await flushPendingChanges()
                } catch {
                  return
                }
                setSelectedId(null)
                setDraft(null)
                setBaseline(null)
              })()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function previewCp(
  item: PayoutListItem | undefined,
  preset: EconomyPreset | undefined,
  familyWeight: number,
  weightOverrides: Record<string, number>
): number | null {
  if (!item || !preset) return null
  const pw = displayWeight(item, weightOverrides) ?? 1
  return weightedCp(item, preset, familyWeight, pw)
}

function showCpPreview(
  item: PayoutListItem | undefined,
  familyWeight: number,
  familyWeightDirty: boolean,
  weightOverrides: Record<string, number>,
  preview: number | null,
  currentCp: number | null
): boolean {
  if (!item || preview == null || currentCp == null) return false
  const pw = displayWeight(item, weightOverrides) ?? 1
  const weightDirty = isWeightDirty(item, weightOverrides)
  if (familyWeight === 1 && !familyWeightDirty && pw === 1 && !weightDirty) {
    return false
  }
  return preview !== currentCp
}

function FamilyBlock({
  family,
  bronze,
  silver,
  gold,
  variants,
  expanded,
  hasVariants,
  cpOverrides,
  weightOverrides,
  familyWeight,
  familyWeightDirty,
  grindyPreset,
  onToggle,
  onAdvanced,
  onCp,
  onFamilyWeight,
  onFlushBlur,
}: {
  family: string
  bronze?: PayoutListItem
  silver?: PayoutListItem
  gold?: PayoutListItem
  variants: PayoutListItem[]
  expanded: boolean
  hasVariants: boolean
  cpOverrides: Record<string, number>
  weightOverrides: Record<string, number>
  familyWeight: number
  familyWeightDirty: boolean
  grindyPreset?: EconomyPreset
  onToggle: () => void
  onAdvanced: (id: string) => void
  onCp: (item: PayoutListItem, value: number) => void
  onFamilyWeight: (family: string, value: number) => void
  onFlushBlur: () => void
}) {
  return (
    <>
      <tr>
        <td className="sticky left-0 z-[1] border-2 border-border bg-card px-2 py-1.5 font-medium">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
              onClick={hasVariants ? onToggle : undefined}
              disabled={!hasVariants}
            >
              {hasVariants ? (
                expanded ? (
                  <ChevronDown className="size-3.5 shrink-0 opacity-70" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 opacity-70" />
                )
              ) : (
                <span className="inline-block size-3.5" />
              )}
              <span className="truncate">{family}</span>
              {hasVariants && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({variants.length})
                </span>
              )}
            </button>
            <span className="shrink-0 text-[0.65rem] text-muted-foreground">
              ×
            </span>
            <Input
              className="h-7 w-14 shrink-0 text-center text-xs"
              type="number"
              min={0}
              step={0.1}
              value={familyWeight}
              aria-label={`Family weight for ${family}`}
              title="Family weight (amp all tiers/variants in this dungeon)"
              onChange={(e) =>
                onFamilyWeight(family, Number(e.target.value))
              }
              onBlur={onFlushBlur}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </td>
        {TIERS.map((t) => {
          const item =
            t.key === "bronze" ? bronze : t.key === "silver" ? silver : gold
          const cp = displayCp(item, cpOverrides)
          const preview = previewCp(
            item,
            grindyPreset,
            familyWeight,
            weightOverrides
          )
          return (
            <CpCell
              key={t.key}
              item={item}
              cp={cp}
              dirty={isCpDirty(item, cpOverrides)}
              preview={preview}
              showPreview={showCpPreview(
                item,
                familyWeight,
                familyWeightDirty,
                weightOverrides,
                preview,
                cp
              )}
              onAdvanced={onAdvanced}
              onCp={onCp}
              onFlushBlur={onFlushBlur}
            />
          )
        })}
      </tr>
      {expanded &&
        variants.map((v) => {
          const cp = displayCp(v, cpOverrides)
          const preview = previewCp(
            v,
            grindyPreset,
            familyWeight,
            weightOverrides
          )
          return (
            <tr key={v.id} className="bg-muted/20">
              <td className="sticky left-0 z-[1] border-2 border-border bg-muted/40 px-2 py-1 pl-7 text-xs text-muted-foreground">
                <span className="text-foreground">
                  {variantDisplayLabel(v)}
                </span>
                {v.mode && v.mode !== "normal" ? (
                  <span className="ml-1 opacity-70">· {v.mode}</span>
                ) : null}
              </td>
              <td colSpan={3} className="border-2 border-border px-2 py-1">
                <div className="flex items-center gap-2 px-1 py-0.5">
                  <CpInput
                    item={v}
                    cp={cp ?? 0}
                    dirty={isCpDirty(v, cpOverrides)}
                    onCp={onCp}
                    onFlushBlur={onFlushBlur}
                  />
                  <span className="text-xs text-muted-foreground">CP</span>
                  {showCpPreview(
                    v,
                    familyWeight,
                    familyWeightDirty,
                    weightOverrides,
                    preview,
                    cp
                  ) ? (
                    <span
                      className="text-[0.65rem] text-muted-foreground"
                      title="Preview after Recalculate from weights"
                    >
                      → {preview}
                    </span>
                  ) : null}
                  {!v.enabled && (
                    <span className="text-xs text-muted-foreground">
                      disabled
                    </span>
                  )}
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="ml-auto text-muted-foreground"
                    title="Advanced payout settings"
                    aria-label={`Advanced settings for ${v.name}`}
                    onClick={() => onAdvanced(v.id)}
                  >
                    <Settings2 className="size-3" />
                  </Button>
                </div>
              </td>
            </tr>
          )
        })}
    </>
  )
}

function CpCell({
  item,
  cp,
  dirty,
  preview,
  showPreview,
  onAdvanced,
  onCp,
  onFlushBlur,
}: {
  item?: PayoutListItem
  cp: number | null
  dirty: boolean
  preview: number | null
  showPreview: boolean
  onAdvanced: (id: string) => void
  onCp: (item: PayoutListItem, value: number) => void
  onFlushBlur: () => void
}) {
  if (!item || cp == null) {
    return (
      <td className="border-2 border-border bg-background/30 px-2 py-1 text-center text-muted-foreground">
        —
      </td>
    )
  }
  return (
    <td className="border-2 border-border px-1 py-1 text-center">
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center justify-center gap-0.5">
          <CpInput
            item={item}
            cp={cp}
            dirty={dirty}
            onCp={onCp}
            onFlushBlur={onFlushBlur}
          />
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground opacity-60 hover:opacity-100"
            title="Advanced payout settings"
            aria-label={`Advanced settings for ${item.name}`}
            onClick={() => onAdvanced(item.id)}
          >
            <Settings2 className="size-3" />
          </Button>
        </div>
        {showPreview && preview != null ? (
          <span
            className="text-[0.6rem] text-muted-foreground"
            title="Preview after Recalculate from weights"
          >
            → {preview}
          </span>
        ) : null}
      </div>
    </td>
  )
}

function CpInput({
  item,
  cp,
  dirty,
  onCp,
  onFlushBlur,
}: {
  item: PayoutListItem
  cp: number
  dirty: boolean
  onCp: (item: PayoutListItem, value: number) => void
  onFlushBlur: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      <Input
        className="h-7 w-16 text-center"
        type="number"
        min={0}
        value={cp}
        aria-label={`CP for ${item.name}`}
        onChange={(e) => onCp(item, Number(e.target.value))}
        onBlur={onFlushBlur}
      />
      {dirty ? <span className="text-gold-hot">*</span> : null}
    </div>
  )
}
