"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"

import {
  downloadAdminPayoutsZipAll,
  fetchAdminPayout,
} from "@/features/admin-payouts/api"
import { PayoutDetailDrawer } from "@/features/admin-payouts/components/PayoutDetailDrawer"
import {
  applyEconomyPreset,
  ECONOMY_PRESET_ORDER,
  ECONOMY_PRESETS,
  type EconomyPresetId,
} from "@/features/admin-payouts/cpPresets"
import {
  groupPayoutsByFamily,
  variantDisplayLabel,
  type SheetDifficulty,
} from "@/features/admin-payouts/groupPayouts"
import {
  useAdminPayouts,
  useCreateAdminPayout,
  useDeleteAdminPayout,
  useSaveAdminPayout,
  useSaveAllAdminPayouts,
} from "@/features/admin-payouts/hooks"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  PAYOUT_SCHEMA_VERSION,
  type DungeonPayoutFile,
  type PayoutListItem,
} from "@/lib/dungeon-payout-types"

const UNSAVED_MSG =
  "You have unsaved payout changes. Leave without saving?"

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
  const { data: list, isLoading, isError, error } = useAdminPayouts()
  const createMutation = useCreateAdminPayout()
  const saveMutation = useSaveAdminPayout()
  const saveAllMutation = useSaveAllAdminPayouts()
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
  const [batchOk, setBatchOk] = useState(false)
  const [exportAllPending, setExportAllPending] = useState(false)

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
    dirtyRef.current = anyDirty
  }, [anyDirty])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) return true
    return window.confirm(UNSAVED_MSG)
  }, [])

  const openPayout = useCallback(
    async (id: string) => {
      if (id === selectedId) return
      if (dirtyDrawer && !window.confirm(UNSAVED_MSG)) return
      setSelectedId(id)
      saveMutation.reset()
      try {
        const file = await fetchAdminPayout(id)
        const withCp = Object.prototype.hasOwnProperty.call(cpOverrides, id)
          ? {
              ...file,
              payout: { ...file.payout, cp: cpOverrides[id] },
            }
          : file
        setDraft(structuredClone(withCp))
        // Baseline is server file so pending CP overrides keep the drawer dirty.
        setBaseline(fingerprint(file))
      } catch (err) {
        setDraft(null)
        setBaseline(null)
        setBatchError(
          err instanceof Error ? err.message : "Failed to load payout"
        )
      }
    },
    [selectedId, dirtyDrawer, cpOverrides, saveMutation]
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

  const familyRows = useMemo(
    () => groupPayoutsByFamily(filteredList),
    [filteredList]
  )

  const setCp = (item: PayoutListItem, value: number) => {
    setCpOverrides((prev) => ({ ...prev, [item.id]: value }))
    setBatchOk(false)
    if (draft?.payout.id === item.id) {
      setDraft({
        ...draft,
        payout: { ...draft.payout, cp: value },
      })
    }
  }

  const applyPreset = (presetId: EconomyPresetId) => {
    const rows = list ?? []
    if (!rows.length) return
    const preset = ECONOMY_PRESETS[presetId]
    if (
      !window.confirm(
        `Apply “${preset.label}” CP preset to all ${rows.length} payouts?\n\n` +
          `Bronze ${preset.bronze} · Silver ${preset.silver} · Gold ${preset.gold}` +
          ` (bearcat ×${preset.bearcatMult}, diaspora ${preset.diaspora}).\n\n` +
          `Changes stay unsaved until you hit Save all dirty.`
      )
    ) {
      return
    }
    const next = applyEconomyPreset(rows, presetId)
    setCpOverrides(next)
    setBatchOk(false)
    if (draft && next[draft.payout.id] != null) {
      setDraft({
        ...draft,
        payout: { ...draft.payout, cp: next[draft.payout.id] },
      })
    }
  }

  const saveAllDirty = async () => {
    setBatchError(null)
    setBatchOk(false)
    const ids = new Set(dirtyCpIds)
    if (dirtyDrawer && draft) ids.add(draft.payout.id)

    const payloads: { id: string; body: DungeonPayoutFile }[] = []
    try {
      for (const id of ids) {
        let body: DungeonPayoutFile
        if (draft?.payout.id === id) {
          body = draft
        } else {
          const file = await fetchAdminPayout(id)
          const cp = cpOverrides[id] ?? file.payout.cp
          body = {
            version: PAYOUT_SCHEMA_VERSION,
            payout: { ...file.payout, cp },
          }
        }
        payloads.push({ id, body })
      }
      await saveAllMutation.mutateAsync(payloads)
      setCpOverrides((prev) => {
        const next = { ...prev }
        for (const id of ids) delete next[id]
        return next
      })
      if (draft && ids.has(draft.payout.id)) {
        setBaseline(fingerprint(draft))
      }
      setBatchOk(true)
      saveMutation.reset()
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Save all failed")
    }
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
            disabled={saveAllMutation.isPending || !anyDirty}
            onClick={() => void saveAllDirty()}
          >
            {saveAllMutation.isPending
              ? "Saving…"
              : `Save all dirty (${
                  dirtyCpIds.length +
                  (dirtyDrawer &&
                  draft &&
                  !dirtyCpIds.includes(draft.payout.id)
                    ? 1
                    : 0)
                })`}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={exportAllPending}
            onClick={() => {
              void (async () => {
                if (anyDirty) {
                  const ok = window.confirm(
                    "You have unsaved sheet changes. Export will use the last saved working copy only. Continue?"
                  )
                  if (!ok) return
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
          {ECONOMY_PRESET_ORDER.map((id) => {
            const p = ECONOMY_PRESETS[id]
            return (
              <Button
                key={id}
                type="button"
                size="sm"
                variant="outline"
                title={p.blurb}
                onClick={() => applyPreset(id)}
              >
                {p.label}
              </Button>
            )
          })}
        </div>
      </div>

      {anyDirty && (
        <FormAlert variant="error">
          Unsaved sheet changes — use Save all dirty (or Save in the drawer).
        </FormAlert>
      )}
      {batchError && <FormAlert variant="error">{batchError}</FormAlert>}
      {batchOk && !anyDirty && (
        <FormAlert variant="success">All dirty payouts saved.</FormAlert>
      )}

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
                if (!confirmDiscard()) return
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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-x-auto border-2 border-border">
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
                    selectedId={selectedId}
                    cpOverrides={cpOverrides}
                    onToggle={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [row.family]: !prev[row.family],
                      }))
                    }
                    onOpen={(id) => void openPayout(id)}
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

        <PayoutDetailDrawer
          draft={draft}
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
          onSave={async () => {
            if (!draft) return
            await saveMutation.mutateAsync(
              { id: draft.payout.id, body: draft },
              {
                onSuccess: () => {
                  setBaseline(fingerprint(draft))
                  setCpOverrides((prev) => {
                    const next = { ...prev }
                    delete next[draft.payout.id]
                    return next
                  })
                },
              }
            )
          }}
          onDelete={() => {
            if (!draft) return
            if (
              !window.confirm(
                `Delete working-copy payout ${draft.payout.id}?`
              )
            ) {
              return
            }
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
          }}
          onClearSelection={() => {
            if (dirtyDrawer && !window.confirm(UNSAVED_MSG)) return
            setSelectedId(null)
            setDraft(null)
            setBaseline(null)
          }}
        />
      </div>
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
  selectedId,
  cpOverrides,
  onToggle,
  onOpen,
  onCp,
}: {
  family: string
  bronze?: PayoutListItem
  silver?: PayoutListItem
  gold?: PayoutListItem
  variants: PayoutListItem[]
  expanded: boolean
  hasVariants: boolean
  selectedId: string | null
  cpOverrides: Record<string, number>
  onToggle: () => void
  onOpen: (id: string) => void
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
              selected={item?.id === selectedId}
              cp={displayCp(item, cpOverrides)}
              dirty={isCpDirty(item, cpOverrides)}
              onOpen={onOpen}
              onCp={onCp}
            />
          )
        })}
      </tr>
      {expanded &&
        variants.map((v) => (
          <tr key={v.id} className="bg-muted/20">
            <td className="sticky left-0 z-[1] border-2 border-border bg-muted/40 px-2 py-1 pl-7 text-xs text-muted-foreground">
              <button
                type="button"
                className="text-left hover:text-foreground"
                onClick={() => onOpen(v.id)}
              >
                <span className="text-foreground">
                  {variantDisplayLabel(v)}
                </span>
                {v.mode && v.mode !== "normal" ? (
                  <span className="ml-1 opacity-70">· {v.mode}</span>
                ) : null}
              </button>
            </td>
            <td colSpan={3} className="border-2 border-border px-2 py-1">
              <div className="flex items-center gap-2">
                <CpInput
                  item={v}
                  selected={v.id === selectedId}
                  cp={displayCp(v, cpOverrides) ?? 0}
                  dirty={isCpDirty(v, cpOverrides)}
                  onOpen={onOpen}
                  onCp={onCp}
                />
                <span className="text-xs text-muted-foreground">CP</span>
                {!v.enabled && (
                  <span className="text-xs text-muted-foreground">disabled</span>
                )}
              </div>
            </td>
          </tr>
        ))}
    </>
  )
}

function CpCell({
  item,
  selected,
  cp,
  dirty,
  onOpen,
  onCp,
}: {
  item?: PayoutListItem
  selected: boolean
  cp: number | null
  dirty: boolean
  onOpen: (id: string) => void
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
    <td
      className={`border-2 px-1 py-1 text-center ${
        selected ? "border-gold-dim bg-muted/60" : "border-border"
      } ${!item.enabled ? "opacity-50" : ""}`}
    >
      <CpInput
        item={item}
        selected={selected}
        cp={cp}
        dirty={dirty}
        onOpen={onOpen}
        onCp={onCp}
      />
    </td>
  )
}

function CpInput({
  item,
  selected,
  cp,
  dirty,
  onOpen,
  onCp,
}: {
  item: PayoutListItem
  selected: boolean
  cp: number
  dirty: boolean
  onOpen: (id: string) => void
  onCp: (item: PayoutListItem, value: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      <Input
        className={`h-7 w-16 text-center ${selected ? "border-gold-dim" : ""}`}
        type="number"
        min={0}
        value={cp}
        aria-label={`CP for ${item.name}`}
        onFocus={() => onOpen(item.id)}
        onChange={(e) => onCp(item, Number(e.target.value))}
        onDoubleClick={() => onOpen(item.id)}
      />
      {dirty ? <span className="text-gold-hot">*</span> : null}
    </div>
  )
}
