"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Plus, Settings2, TriangleAlert } from "lucide-react"

import {
  downloadAdminPayoutsZipAll,
  fetchAdminPayout,
} from "@/features/admin-payouts/api"
import { CpPresetsManageDialog } from "@/features/admin-payouts/components/CpPresetsManageDialog"
import { PayoutDetailDrawer } from "@/features/admin-payouts/components/PayoutDetailDrawer"
import { applyEconomyPreset } from "@/features/admin-payouts/cpPresets"
import {
  groupPayoutsByFamily,
  variantDisplayLabel,
  type SheetDifficulty,
} from "@/features/admin-payouts/groupPayouts"
import {
  useAdminCpPresets,
  useAdminPayoutConflicts,
  useAdminPayouts,
  useCreateAdminPayout,
  useDeleteAdminPayout,
  useRetireAdminPayoutConflictPackages,
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
import {
  PAYOUT_SCHEMA_VERSION,
  type DungeonPayoutFile,
  type PayoutListItem,
} from "@/lib/dungeon-payout-types"

const AUTO_SAVE_MS = 800

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

export function DungeonPayoutsPanel() {
  const confirm = useConfirm()
  const { data: list, isLoading, isError, error } = useAdminPayouts()
  const { data: conflictData } = useAdminPayoutConflicts()
  const retireConflicts = useRetireAdminPayoutConflictPackages()
  const { data: cpPresets = [] } = useAdminCpPresets()
  const liveConflicts = conflictData?.conflicts ?? []
  const createMutation = useCreateAdminPayout()
  const saveMutation = useSaveAdminPayout()
  const deleteMutation = useDeleteAdminPayout()

  const [filter, setFilter] = useState("")
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [cpOverrides, setCpOverrides] = useState<Record<string, number>>({})
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

  const draftRef = useRef(draft)
  const cpOverridesRef = useRef(cpOverrides)
  draftRef.current = draft
  cpOverridesRef.current = cpOverrides

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

  const anyDirty = dirtyDrawer || dirtyCpIds.length > 0
  const dirtyRef = useRef(false)
  useEffect(() => {
    dirtyRef.current = anyDirty || saveMutation.isPending
  }, [anyDirty, saveMutation.isPending])

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
    const currentDraft = draftRef.current
    const currentCpOverrides = cpOverridesRef.current
    const cpDirty = Object.keys(currentCpOverrides).filter((id) => {
      const row = list?.find((p) => p.id === id)
      return row != null && currentCpOverrides[id] !== row.cp
    })
    const drawerDirty =
      currentDraft &&
      baseline != null &&
      fingerprint(currentDraft) !== baseline

    const ids = new Set(cpDirty)
    if (drawerDirty && currentDraft) ids.add(currentDraft.payout.id)
    if (ids.size === 0) return

    setBatchError(null)
    try {
      for (const id of ids) {
        let body: DungeonPayoutFile
        if (currentDraft?.payout.id === id) {
          body = currentDraft
        } else {
          const file = await fetchAdminPayout(id)
          const cp = currentCpOverrides[id] ?? file.payout.cp
          body = {
            version: PAYOUT_SCHEMA_VERSION,
            payout: { ...file.payout, cp },
          }
        }
        await saveMutation.mutateAsync({ id, body })
      }
      setCpOverrides((prev) => {
        const next = { ...prev }
        for (const id of ids) delete next[id]
        return next
      })
      if (currentDraft && ids.has(currentDraft.payout.id)) {
        setBaseline(fingerprint(currentDraft))
      }
      saveMutation.reset()
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Save failed")
      throw err
    }
  }, [baseline, list, saveMutation])

  useEffect(() => {
    if (!anyDirty || saveMutation.isPending) return
    const timer = window.setTimeout(() => {
      void flushPendingChanges()
    }, AUTO_SAVE_MS)
    return () => window.clearTimeout(timer)
  }, [anyDirty, draft, cpOverrides, flushPendingChanges, saveMutation.isPending])

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

  const setCp = (item: PayoutListItem, value: number) => {
    setCpOverrides((prev) => ({ ...prev, [item.id]: value }))
    if (draft?.payout.id === item.id) {
      setDraft({
        ...draft,
        payout: { ...draft.payout, cp: value },
      })
    }
  }

  const applyPreset = (preset: EconomyPreset) => {
    void (async () => {
      const rows = list ?? []
      if (!rows.length) return
      const ok = await confirm({
        title: `Apply “${preset.label}” preset?`,
        description:
          `Apply to all ${rows.length} payouts.\n\n` +
          `Bronze ${preset.bronze} · Silver ${preset.silver} · Gold ${preset.gold}` +
          ` (bearcat ×${preset.bearcatMult}, diaspora ${preset.diaspora}).`,
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
      setCpOverrides(next)
      draftRef.current = nextDraft
      cpOverridesRef.current = next
      try {
        await flushPendingChanges()
      } catch {
        // flushPendingChanges already surfaced the error
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
            disabled={exportAllPending || saveMutation.isPending}
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
      </div>

      <CpPresetsManageDialog
        open={presetsManageOpen}
        onOpenChange={setPresetsManageOpen}
        presets={cpPresets}
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
                  onToggle={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [row.family]: !prev[row.family],
                    }))
                  }
                  onAdvanced={(id) => void openPayout(id)}
                  onCp={setCp}
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
        Edit CP in the cells. Use the gear only for advanced payout settings
        (enable, clear grants, export). Boss crate items live under Dungeon
        loot.
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
            savePending={saveMutation.isPending}
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

function FamilyBlock({
  family,
  bronze,
  silver,
  gold,
  variants,
  expanded,
  hasVariants,
  cpOverrides,
  onToggle,
  onAdvanced,
  onCp,
}: {
  family: string
  bronze?: PayoutListItem
  silver?: PayoutListItem
  gold?: PayoutListItem
  variants: PayoutListItem[]
  expanded: boolean
  hasVariants: boolean
  cpOverrides: Record<string, number>
  onToggle: () => void
  onAdvanced: (id: string) => void
  onCp: (item: PayoutListItem, value: number) => void
}) {
  return (
    <>
      <tr>
        <td className="sticky left-0 z-[1] border-2 border-border bg-card px-2 py-1.5 font-medium">
          <button
            type="button"
            className="flex w-full items-center gap-1 text-left"
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
        </td>
        {TIERS.map((t) => {
          const item =
            t.key === "bronze" ? bronze : t.key === "silver" ? silver : gold
          return (
            <CpCell
              key={t.key}
              item={item}
              cp={displayCp(item, cpOverrides)}
              dirty={isCpDirty(item, cpOverrides)}
              onAdvanced={onAdvanced}
              onCp={onCp}
            />
          )
        })}
      </tr>
      {expanded &&
        variants.map((v) => (
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
                  cp={displayCp(v, cpOverrides) ?? 0}
                  dirty={isCpDirty(v, cpOverrides)}
                  onCp={onCp}
                />
                <span className="text-xs text-muted-foreground">CP</span>
                {!v.enabled && (
                  <span className="text-xs text-muted-foreground">disabled</span>
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
        ))}
    </>
  )
}

function CpCell({
  item,
  cp,
  dirty,
  onAdvanced,
  onCp,
}: {
  item?: PayoutListItem
  cp: number | null
  dirty: boolean
  onAdvanced: (id: string) => void
  onCp: (item: PayoutListItem, value: number) => void
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
      <div className="flex items-center justify-center gap-0.5">
        <CpInput item={item} cp={cp} dirty={dirty} onCp={onCp} />
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
    </td>
  )
}

function CpInput({
  item,
  cp,
  dirty,
  onCp,
}: {
  item: PayoutListItem
  cp: number
  dirty: boolean
  onCp: (item: PayoutListItem, value: number) => void
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
      />
      {dirty ? <span className="text-gold-hot">*</span> : null}
    </div>
  )
}
