"use client"

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react"
import { useSearchParams } from "next/navigation"
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { useConfirm } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { DungeonLootDrawer } from "@/features/admin-dungeon-loot/components/DungeonLootDrawer"
import {
  groupDungeonLootByFamily,
  variantDisplayLabel,
} from "@/features/admin-dungeon-loot/groupDungeonLoot"
import { fetchReportRewardDungeon } from "@/features/admin-report-rewards/api"
import {
  usePatchReportRewardDungeonList,
  useReportRewardDungeons,
  useReportRewardGlobal,
  useSaveReportRewardDungeon,
  useSaveReportRewardGlobal,
  useSetAllReportRewardsEnabled,
} from "@/features/admin-report-rewards/hooks"
import {
  STOCK_REPORT_COST_MESSAGE_IDS,
  linearTradeTiers,
  stockChoiceMessageIdForCost,
  tradeTiersMissingStockLabels,
  type ReportRewardDungeonFile,
  type ReportRewardGlobalFile,
} from "@/lib/report-reward-types"

const AUTO_SAVE_MS = 900

const TIERS = [
  { key: "bronze" as const, label: "Bronze", headClass: "bg-[#3d2a1a]/80 text-[#e8c49a]" },
  { key: "silver" as const, label: "Silver", headClass: "bg-[#2a2e34]/90 text-[#c8d0d8]" },
  { key: "gold" as const, label: "Gold", headClass: "bg-[#3a3218]/90 text-[#e6d090]" },
]

function fingerprint(file: ReportRewardDungeonFile): string {
  return JSON.stringify(file)
}

function globalFingerprint(file: ReportRewardGlobalFile): string {
  return JSON.stringify(file)
}

function lootCellLabel(item: { enabled: boolean; dropCount: number }): string {
  if (!item.enabled) return "off"
  return item.dropCount ? `${item.dropCount} drop${item.dropCount === 1 ? "" : "s"}` : "empty"
}

export function DungeonLootPanel() {
  const confirm = useConfirm()
  const searchParams = useSearchParams()
  const globalQuery = useReportRewardGlobal()
  const dungeonsQuery = useReportRewardDungeons()
  const saveGlobal = useSaveReportRewardGlobal()
  const saveDungeon = useSaveReportRewardDungeon()
  const patchDungeonList = usePatchReportRewardDungeonList()
  const setAllEnabled = useSetAllReportRewardsEnabled()

  const [globalDraft, setGlobalDraft] = useState<ReportRewardGlobalFile | null>(
    null
  )
  const [globalBaseline, setGlobalBaseline] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ReportRewardDungeonFile | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    if (globalQuery.data && globalBaseline == null) {
      setGlobalDraft(globalQuery.data)
      setGlobalBaseline(globalFingerprint(globalQuery.data))
    }
  }, [globalQuery.data, globalBaseline])

  const globalDirty = useMemo(() => {
    if (!globalDraft || globalBaseline == null) return false
    return globalFingerprint(globalDraft) !== globalBaseline
  }, [globalDraft, globalBaseline])

  const globalDraftRef = useRef(globalDraft)
  globalDraftRef.current = globalDraft

  const openDungeon = useCallback(async (id: string) => {
    setSelectedId(id)
    setSaveError(null)
    setSaveOk(false)
    try {
      const file = await fetchReportRewardDungeon(id)
      setDraft(structuredClone(file))
      setBaseline(fingerprint(file))
    } catch (e) {
      setDraft(null)
      setBaseline(null)
      setError(e instanceof Error ? e.message : "Failed to load dungeon")
    }
  }, [])

  useEffect(() => {
    const id = searchParams.get("dungeon")?.trim()
    if (id && id !== selectedId) {
      void openDungeon(id)
    }
  }, [searchParams, selectedId, openDungeon])

  const isDirty = draft != null && baseline != null && fingerprint(draft) !== baseline

  const persistDungeon = useCallback(async () => {
    const current = draftRef.current
    if (!current || !isDirty) return
    setSaveError(null)
    try {
      await saveDungeon.mutateAsync({ id: current.dungeon.id, body: current })
      setBaseline(fingerprint(current))
      setSaveOk(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed")
      throw e
    }
  }, [isDirty, saveDungeon])

  useEffect(() => {
    if (!draft || !isDirty) return
    const t = setTimeout(() => {
      void persistDungeon()
    }, AUTO_SAVE_MS)
    return () => clearTimeout(t)
  }, [draft, isDirty, persistDungeon])

  const persistGlobal = useCallback(async () => {
    const current = globalDraftRef.current
    if (!current || !globalDirty) return
    setError(null)
    try {
      await saveGlobal.mutateAsync(current)
      setGlobalBaseline(globalFingerprint(current))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Global save failed")
    }
  }, [globalDirty, saveGlobal])

  useEffect(() => {
    if (!globalDirty) return
    const t = setTimeout(() => {
      void persistGlobal()
    }, AUTO_SAVE_MS)
    return () => clearTimeout(t)
  }, [globalDraft, globalDirty, persistGlobal])

  const handleDungeonChange = useCallback(
    (next: ReportRewardDungeonFile) => {
      setDraft(next)
      patchDungeonList(next)
    },
    [patchDungeonList]
  )

  const setAllLive = useCallback(
    async (enabled: boolean) => {
      const total = (dungeonsQuery.data ?? []).length
      if (!total) return
      const ok = await confirm({
        title: enabled ? "Turn live on for all?" : "Turn live off for all?",
        description: enabled
          ? `Enable boss-crate loot for all ${total} dungeons. Publish from Overview when you want it live in-game.`
          : `Disable boss-crate loot for all ${total} dungeons. Publish from Overview when you want it live in-game.`,
        confirmLabel: enabled ? "Turn all on" : "Turn all off",
      })
      if (!ok) return
      setError(null)
      try {
        await setAllEnabled.mutateAsync(enabled)
        setDraft((prev) => {
          if (!prev) return prev
          const next = {
            ...prev,
            dungeon: { ...prev.dungeon, enabled },
          }
          setBaseline(fingerprint(next))
          return next
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bulk update failed")
      }
    },
    [confirm, dungeonsQuery.data, setAllEnabled]
  )

  const filteredList = useMemo(() => {
    let rows = dungeonsQuery.data ?? []
    if (enabledOnly) rows = rows.filter((r) => r.enabled)
    const q = filter.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.family?.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.id.includes(q)
      )
    }
    return rows
  }, [dungeonsQuery.data, filter, enabledOnly])

  const familyRows = useMemo(
    () => groupDungeonLootByFamily(filteredList),
    [filteredList]
  )

  const selectedListItem = useMemo(
    () => dungeonsQuery.data?.find((d) => d.id === selectedId) ?? null,
    [dungeonsQuery.data, selectedId]
  )

  const enabledCount = useMemo(
    () => (dungeonsQuery.data ?? []).filter((d) => d.enabled).length,
    [dungeonsQuery.data]
  )

  if (globalQuery.isLoading || dungeonsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading dungeon loot…</p>
  }

  if (!globalDraft) {
    return <FormAlert variant="error">Could not load settings.</FormAlert>
  }

  const g = globalDraft.global

  const updateTrader = (
    index: number,
    patch: Partial<(typeof g.traders)[number]>
  ) => {
    const traders = [...(g.traders ?? [])]
    const cur = traders[index]
    if (!cur) return
    traders[index] = { ...cur, ...patch }
    setGlobalDraft({
      ...globalDraft,
      global: { ...g, traders },
    })
  }

  return (
    <div className="space-y-4">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <section className="rounded-lg border border-border bg-[#0c1018] p-4">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          CP exchange
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          When a drop is marked tradable for CP, players turn stacks in at this
          NPC. Publish from Overview when ready.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>Default tradable item id</FieldLabel>
            <Input
              type="number"
              value={g.reportItemId}
              onChange={(e) =>
                setGlobalDraft({
                  ...globalDraft,
                  global: {
                    ...g,
                    reportItemId: Number(e.target.value) || 1,
                  },
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>Item name (your notes)</FieldLabel>
            <Input
              value={g.reportItemLabel ?? ""}
              placeholder="Dungeon report"
              onChange={(e) =>
                setGlobalDraft({
                  ...globalDraft,
                  global: { ...g, reportItemLabel: e.target.value },
                })
              }
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>Items traded for 1 CP</FieldLabel>
            <Input
              type="number"
              min={1}
              value={g.itemsPerCp}
              onChange={(e) =>
                setGlobalDraft({
                  ...globalDraft,
                  global: {
                    ...g,
                    itemsPerCp: Math.max(1, Number(e.target.value) || 1),
                  },
                })
              }
            />
            <p className="mt-1 text-[0.65rem] text-muted-foreground">
              Linear rate only — packages below are multiples of this (edit
              packages under Advanced).
            </p>
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              NPC packages
            </p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {linearTradeTiers(g.itemsPerCp, g.cpPackages).map((tier) => {
                const stock = stockChoiceMessageIdForCost(tier.cost)
                return (
                  <li key={tier.cp}>
                    <span className="tabular-nums text-foreground">
                      {tier.cost}
                    </span>{" "}
                    items →{" "}
                    <span className="tabular-nums text-foreground">
                      {tier.cp}
                    </span>{" "}
                    CP
                    {stock == null ? (
                      <span className="ml-1 text-cyan-300/90">
                        (custom dialog — client overlay on publish)
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {tradeTiersMissingStockLabels(g.itemsPerCp, g.cpPackages).length >
            0 ? (
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                Non-stock item costs ({" "}
                {Object.keys(STOCK_REPORT_COST_MESSAGE_IDS).join("/")} are
                stock) auto-allocate CEventMessage IDs. Publish patches the
                client overlay — players must run ImagineUpdate. Requires{" "}
                <span className="font-mono">comp_bdpatch</span> in ops-tools.
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className="mt-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          Advanced (NPC packages, traders &amp; dialog ids)
        </button>
        {showAdvanced ? (
          <div className="mt-3 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    NPC packages (CP amounts)
                  </h3>
                  <p className="text-[0.65rem] text-muted-foreground">
                    Each value is CP granted. Items taken = items-per-CP × this
                    amount. Button text is the item cost: stock strings for
                    10/50/100/…, otherwise a custom client message is created on
                    publish.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={(g.cpPackages?.length ?? 0) >= 20}
                  onClick={() => {
                    const pkgs = [...(g.cpPackages ?? [])]
                    const next = Math.max(1, ...(pkgs.length ? pkgs : [0])) + 1
                    setGlobalDraft({
                      ...globalDraft,
                      global: {
                        ...g,
                        cpPackages: [...pkgs, next].sort((a, b) => a - b),
                      },
                    })
                  }}
                >
                  <Plus className="size-3.5" /> Add package
                </Button>
              </div>
              <div className="space-y-2">
                {(g.cpPackages ?? []).map((cp, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field className="max-w-[8rem]">
                      <FieldLabel>CP</FieldLabel>
                      <Input
                        type="number"
                        min={1}
                        value={cp}
                        onChange={(e) => {
                          const pkgs = [...(g.cpPackages ?? [])]
                          pkgs[i] = Math.max(1, Number(e.target.value) || 1)
                          setGlobalDraft({
                            ...globalDraft,
                            global: { ...g, cpPackages: pkgs },
                          })
                        }}
                        onBlur={() => {
                          const pkgs = [...new Set(g.cpPackages ?? [])]
                            .map((n) => Math.max(1, Math.floor(n)))
                            .sort((a, b) => a - b)
                          setGlobalDraft({
                            ...globalDraft,
                            global: {
                              ...g,
                              cpPackages: pkgs.length ? pkgs : [1],
                            },
                          })
                        }}
                      />
                    </Field>
                    <span className="pb-2 text-xs text-muted-foreground tabular-nums">
                      = {g.itemsPerCp * cp} items
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="mb-0.5 text-[#ff9b9b]"
                      aria-label="Remove package"
                      disabled={(g.cpPackages?.length ?? 0) <= 1}
                      onClick={() => {
                        const pkgs = (g.cpPackages ?? []).filter(
                          (_, j) => j !== i
                        )
                        setGlobalDraft({
                          ...globalDraft,
                          global: {
                            ...g,
                            cpPackages: pkgs.length ? pkgs : [1],
                          },
                        })
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Trader NPCs
                  </h3>
                  <p className="text-[0.65rem] text-muted-foreground">
                    Same report→CP dialog on each spawn. Add copies in popular
                    hangouts (map id + NPC id + X/Y). Max 32.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={(g.traders?.length ?? 0) >= 32}
                  onClick={() => {
                    const list = g.traders ?? []
                    const last = list[list.length - 1]
                    const next = last
                      ? {
                          ...last,
                          label: `${last.label} (copy)`,
                          x: last.x + 20,
                        }
                      : {
                          label: "CP trader",
                          dynamicMapId: 20101,
                          npcId: 393,
                          x: 172,
                          y: 603,
                          rotation: 4.71239,
                        }
                    setGlobalDraft({
                      ...globalDraft,
                      global: { ...g, traders: [...list, next] },
                    })
                  }}
                >
                  <Plus className="size-3.5" /> Add trader
                </Button>
              </div>
              <div className="space-y-3">
                {(g.traders ?? []).map((trader, i) => (
                  <div
                    key={i}
                    className="space-y-2 border border-border/60 bg-muted/10 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Field className="min-w-0 flex-1">
                        <FieldLabel>Label</FieldLabel>
                        <Input
                          value={trader.label}
                          onChange={(e) =>
                            updateTrader(i, {
                              label: e.target.value || `Trader ${i + 1}`,
                            })
                          }
                        />
                      </Field>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="mt-5 shrink-0 text-[#ff9b9b]"
                        aria-label="Remove trader"
                        disabled={(g.traders?.length ?? 0) <= 1}
                        onClick={() => {
                          const traders = (g.traders ?? []).filter(
                            (_, j) => j !== i
                          )
                          setGlobalDraft({
                            ...globalDraft,
                            global: { ...g, traders },
                          })
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <Field>
                        <FieldLabel>Map id</FieldLabel>
                        <Input
                          type="number"
                          value={trader.dynamicMapId}
                          onChange={(e) =>
                            updateTrader(i, {
                              dynamicMapId: Number(e.target.value) || 20101,
                            })
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel>NPC id</FieldLabel>
                        <Input
                          type="number"
                          value={trader.npcId}
                          onChange={(e) =>
                            updateTrader(i, {
                              npcId: Number(e.target.value) || 1,
                            })
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel>X / Y</FieldLabel>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={trader.x}
                            onChange={(e) =>
                              updateTrader(i, {
                                x: Number(e.target.value) || 0,
                              })
                            }
                          />
                          <Input
                            type="number"
                            value={trader.y}
                            onChange={(e) =>
                              updateTrader(i, {
                                y: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                      </Field>
                      <Field>
                        <FieldLabel>Rotation</FieldLabel>
                        <Input
                          type="number"
                          step="any"
                          value={trader.rotation}
                          onChange={(e) =>
                            updateTrader(i, {
                              rotation: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                {(g.traders?.length ?? 0) === 0 ? (
                  <p className="text-[0.65rem] text-muted-foreground">
                    No traders — CP exchange NPC will not spawn until you add
                    one.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field>
              <FieldLabel>Event prefix</FieldLabel>
              <Input
                value={g.eventPrefix}
                onChange={(e) =>
                  setGlobalDraft({
                    ...globalDraft,
                    global: { ...g, eventPrefix: e.target.value },
                  })
                }
              />
            </Field>
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-end gap-3 border-2 border-border bg-muted/20 p-3">
            <Field className="min-w-[12rem] flex-1">
              <FieldLabel htmlFor="loot-filter">Filter</FieldLabel>
              <Input
                id="loot-filter"
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
              Live only
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={setAllEnabled.isPending || !(dungeonsQuery.data ?? []).length}
              onClick={() => void setAllLive(true)}
            >
              {setAllEnabled.isPending && setAllEnabled.variables === true
                ? "Turning on…"
                : "Turn all on"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={setAllEnabled.isPending || !(dungeonsQuery.data ?? []).length}
              onClick={() => void setAllLive(false)}
            >
              {setAllEnabled.isPending && setAllEnabled.variables === false
                ? "Turning off…"
                : "Turn all off"}
            </Button>
            <span className="pb-1 text-xs text-muted-foreground">
              {enabledCount} live · {(dungeonsQuery.data ?? []).length} total
            </span>
          </div>

          <div className="overflow-x-auto border-2 border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b-2 border-border bg-muted/30">
                  <th className="px-2 py-2 font-medium">Family</th>
                  {TIERS.map((t) => (
                    <th
                      key={t.key}
                      className={`px-2 py-2 text-center font-medium ${t.headClass}`}
                    >
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {familyRows.map((row) => {
                  const isOpen = expanded[row.family]
                  return (
                    <Fragment key={row.family}>
                      <tr className="border-b border-border/60">
                        <td className="px-2 py-1.5 font-medium">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-cyan-200"
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [row.family]: !prev[row.family],
                              }))
                            }
                          >
                            {row.variants.length ? (
                              isOpen ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )
                            ) : (
                              <span className="inline-block w-3.5" />
                            )}
                            {row.family}
                          </button>
                        </td>
                        {TIERS.map((t) => {
                          const item = row[t.key]
                          const active = item?.id === selectedId
                          return (
                            <td key={t.key} className="px-1 py-1 text-center">
                              {item ? (
                                <button
                                  type="button"
                                  className={`w-full rounded px-1 py-1.5 transition-colors ${
                                    active
                                      ? "bg-cyan-900/50 ring-1 ring-cyan-500/60"
                                      : item.enabled
                                        ? "bg-emerald-950/40 hover:bg-emerald-900/40"
                                        : "bg-muted/30 hover:bg-muted/50"
                                  }`}
                                  onClick={() => void openDungeon(item.id)}
                                >
                                  <span className="block font-medium">
                                    {lootCellLabel(item)}
                                  </span>
                                </button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                      {isOpen && row.variants.length
                        ? row.variants.map((v) => (
                            <tr
                              key={v.id}
                              className="border-b border-border/40 bg-muted/10"
                            >
                              <td className="px-2 py-1 pl-8 text-muted-foreground">
                                {variantDisplayLabel(v)}
                              </td>
                              <td colSpan={3} className="px-1 py-1 text-center">
                                <button
                                  type="button"
                                  className={`rounded px-2 py-1 ${
                                    v.id === selectedId
                                      ? "bg-cyan-900/50 ring-1 ring-cyan-500/60"
                                      : "hover:bg-muted/40"
                                  }`}
                                  onClick={() => void openDungeon(v.id)}
                                >
                                  {lootCellLabel(v)}
                                </button>
                              </td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[0.65rem] text-muted-foreground">
            Click a cell to edit boss crate drops for that dungeon. Changes stay
            in draft until you publish from Admin → Overview.
          </p>
        </div>

        {draft ? (
          <DungeonLootDrawer
            draft={draft}
            listItem={selectedListItem}
            saveError={saveError}
            saveOk={saveOk && !isDirty}
            onChange={handleDungeonChange}
            onFlushSave={persistDungeon}
            onClearSelection={() => {
              setSelectedId(null)
              setDraft(null)
              setBaseline(null)
            }}
          />
        ) : (
          <aside className="hidden w-full flex-col border-2 border-border bg-card p-4 text-sm text-muted-foreground lg:flex lg:w-[28rem] lg:shrink-0">
            <p className="font-medium text-foreground/80">Select a dungeon</p>
            <p className="mt-2">
              Pick Bronze, Silver, or Gold to add items to the boss crate — gems,
              weapons, reports, anything with a valid item id.
            </p>
          </aside>
        )}
      </div>
    </div>
  )
}
