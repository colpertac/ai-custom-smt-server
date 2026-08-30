"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { downloadAdminPayoutZip } from "@/features/admin-payouts/api"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { DungeonPayout, DungeonPayoutFile } from "@/lib/dungeon-payout-types"

type Props = {
  draft: DungeonPayoutFile | null
  isDirty: boolean
  savePending: boolean
  deletePending: boolean
  saveError: string | null
  saveOk: boolean
  onChange: (next: DungeonPayoutFile) => void
  onSave: () => void | Promise<void>
  onDelete: () => void
  onClearSelection: () => void
}

function updatePayout(
  draft: DungeonPayoutFile,
  patch: Partial<DungeonPayout>
): DungeonPayoutFile {
  return { ...draft, payout: { ...draft.payout, ...patch } }
}

export function PayoutDetailDrawer({
  draft,
  isDirty,
  savePending,
  deletePending,
  saveError,
  saveOk,
  onChange,
  onSave,
  onDelete,
  onClearSelection,
}: Props) {
  const [exportPending, setExportPending] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  if (!draft) {
    return (
      <aside className="flex max-h-[calc(100vh-8rem)] w-full flex-col border-2 border-border bg-card lg:w-[26rem] lg:shrink-0">
        <div className="border-b-2 border-border px-3 py-2">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Payout detail
          </h2>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
          <p className="font-medium text-foreground/80">Select a dungeon</p>
          <p>
            Click or focus a Bronze / Silver / Gold cell (or a variant row) to
            edit crates, clear items, enable, and export.
          </p>
        </div>
      </aside>
    )
  }

  const p = draft.payout

  async function onDownloadZip() {
    setExportError(null)
    if (isDirty) {
      const ok = window.confirm(
        "This payout has unsaved changes. Save them, then export the working copy?"
      )
      if (!ok) return
      try {
        await onSave()
      } catch {
        setExportError("Save failed — fix errors before exporting.")
        return
      }
    }
    setExportPending(true)
    try {
      await downloadAdminPayoutZip(p.id)
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Failed to download zip"
      )
    } finally {
      setExportPending(false)
    }
  }

  return (
    <aside className="flex max-h-[calc(100vh-8rem)] w-full flex-col border-2 border-border bg-card lg:w-[26rem] lg:shrink-0">
      <div className="flex items-start justify-between gap-2 border-b-2 border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-wide uppercase">
            {p.name}
            {isDirty ? (
              <span className="ml-2 font-normal normal-case text-gold-hot">
                Unsaved
              </span>
            ) : null}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {p.id} · inst {p.instanceId}
            {p.family ? ` · ${p.family}` : ""}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
        >
          Clear
        </Button>
      </div>

      <div className="flex items-center justify-end border-b-2 border-border px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={exportPending || savePending}
          onClick={() => void onDownloadZip()}
        >
          {exportPending ? "Downloading…" : "Download zip"}
        </Button>
      </div>

      <div className="space-y-4 overflow-y-auto p-3 text-sm">
        {isDirty && (
          <FormAlert variant="error">
            Unsaved changes — save or discard before switching cells.
          </FormAlert>
        )}

        <FieldGroup className="gap-2">
          <Field>
            <FieldLabel htmlFor="drawer-name">Name</FieldLabel>
            <Input
              id="drawer-name"
              value={p.name}
              onChange={(e) => onChange(updatePayout(draft, { name: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="drawer-cp">CP</FieldLabel>
            <Input
              id="drawer-cp"
              type="number"
              min={0}
              value={p.cp}
              onChange={(e) =>
                onChange(updatePayout(draft, { cp: Number(e.target.value) }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="drawer-inst">Instance ID</FieldLabel>
            <Input
              id="drawer-inst"
              type="number"
              value={p.instanceId}
              onChange={(e) =>
                onChange(
                  updatePayout(draft, { instanceId: Number(e.target.value) })
                )
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="drawer-notes">Notes</FieldLabel>
            <Input
              id="drawer-notes"
              value={p.notes ?? ""}
              onChange={(e) =>
                onChange(updatePayout(draft, { notes: e.target.value }))
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.enabled}
              onChange={(e) =>
                onChange(updatePayout(draft, { enabled: e.target.checked }))
              }
            />
            Enabled (tracking / filter only)
          </label>
        </FieldGroup>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Crate drops
            </h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange(
                  updatePayout(draft, {
                    crateDrops: [
                      ...p.crateDrops,
                      { itemId: 1, minStack: 1, maxStack: 1, rate: 10 },
                    ],
                  })
                )
              }
            >
              <Plus data-icon="inline-start" />
              Add
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1 pr-1 font-medium">Item</th>
                  <th className="py-1 pr-1 font-medium">Min</th>
                  <th className="py-1 pr-1 font-medium">Max</th>
                  <th className="py-1 pr-1 font-medium">Rate</th>
                  <th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {p.crateDrops.map((d, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1 pr-1">
                      <Input
                        className="h-7 w-16"
                        type="number"
                        value={d.itemId}
                        onChange={(e) => {
                          const crateDrops = [...p.crateDrops]
                          crateDrops[i] = {
                            ...d,
                            itemId: Number(e.target.value),
                          }
                          onChange(updatePayout(draft, { crateDrops }))
                        }}
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <Input
                        className="h-7 w-12"
                        type="number"
                        value={d.minStack}
                        onChange={(e) => {
                          const crateDrops = [...p.crateDrops]
                          crateDrops[i] = {
                            ...d,
                            minStack: Number(e.target.value),
                          }
                          onChange(updatePayout(draft, { crateDrops }))
                        }}
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <Input
                        className="h-7 w-12"
                        type="number"
                        value={d.maxStack}
                        onChange={(e) => {
                          const crateDrops = [...p.crateDrops]
                          crateDrops[i] = {
                            ...d,
                            maxStack: Number(e.target.value),
                          }
                          onChange(updatePayout(draft, { crateDrops }))
                        }}
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <Input
                        className="h-7 w-12"
                        type="number"
                        value={d.rate}
                        onChange={(e) => {
                          const crateDrops = [...p.crateDrops]
                          crateDrops[i] = {
                            ...d,
                            rate: Number(e.target.value),
                          }
                          onChange(updatePayout(draft, { crateDrops }))
                        }}
                      />
                    </td>
                    <td className="py-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-[#ff9b9b]"
                        aria-label="Remove drop"
                        onClick={() =>
                          onChange(
                            updatePayout(draft, {
                              crateDrops: p.crateDrops.filter((_, j) => j !== i),
                            })
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Clear items
            </h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange(
                  updatePayout(draft, {
                    clearItems: [
                      ...p.clearItems,
                      { itemId: 21941, quantity: 1 },
                    ],
                  })
                )
              }
            >
              <Plus data-icon="inline-start" />
              Add
            </Button>
          </div>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1 pr-1 font-medium">Item</th>
                <th className="py-1 pr-1 font-medium">Qty</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {p.clearItems.map((c, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1 pr-1">
                    <Input
                      className="h-7 w-20"
                      type="number"
                      value={c.itemId}
                      onChange={(e) => {
                        const clearItems = [...p.clearItems]
                        clearItems[i] = {
                          ...c,
                          itemId: Number(e.target.value),
                        }
                        onChange(updatePayout(draft, { clearItems }))
                      }}
                    />
                  </td>
                  <td className="py-1 pr-1">
                    <Input
                      className="h-7 w-14"
                      type="number"
                      value={c.quantity}
                      onChange={(e) => {
                        const clearItems = [...p.clearItems]
                        clearItems[i] = {
                          ...c,
                          quantity: Number(e.target.value),
                        }
                        onChange(updatePayout(draft, { clearItems }))
                      }}
                    />
                  </td>
                  <td className="py-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-[#ff9b9b]"
                      aria-label="Remove clear item"
                      onClick={() =>
                        onChange(
                          updatePayout(draft, {
                            clearItems: p.clearItems.filter((_, j) => j !== i),
                          })
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
              {!p.clearItems.length && (
                <tr>
                  <td colSpan={3} className="py-2 text-muted-foreground">
                    None (e.g. Golden Apple / Coral / Yantra).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {saveError && <FormAlert variant="error">{saveError}</FormAlert>}
        {exportError && <FormAlert variant="error">{exportError}</FormAlert>}
        {saveOk && !isDirty && (
          <FormAlert variant="success">Saved to working copy.</FormAlert>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t-2 border-border p-3">
        <Button
          type="button"
          size="sm"
          disabled={savePending || !isDirty}
          onClick={() => void onSave()}
        >
          {savePending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-[#ff9b9b]"
          disabled={deletePending}
          onClick={onDelete}
        >
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
      </div>
    </aside>
  )
}
