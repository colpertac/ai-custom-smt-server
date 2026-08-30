"use client"

import Link from "next/link"
import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { downloadAdminPayoutZip } from "@/features/admin-payouts/api"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type {
  DungeonPayout,
  DungeonPayoutFile,
  PayoutListItem,
} from "@/lib/dungeon-payout-types"

function wireLabel(status: PayoutListItem["wireStatus"]): string {
  switch (status) {
    case "wired":
      return "Live-wired"
    case "partial":
      return "Partially wired"
    case "hooks_ready":
      return "Hooks ready (stock not patched)"
    case "unwired_stub":
      return "Not mapped yet"
    default:
      return "Unknown wire status"
  }
}

type Props = {
  draft: DungeonPayoutFile | null
  listItem?: PayoutListItem | null
  isDirty: boolean
  savePending: boolean
  deletePending: boolean
  saveError: string | null
  saveOk: boolean
  onChange: (next: DungeonPayoutFile) => void
  onFlushSave: () => void | Promise<void>
  onDelete: () => void
  onClearSelection: () => void
}

const COMPACT_TABLE_INPUT =
  "h-7 w-full min-w-0 px-1.5 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"

function updatePayout(
  draft: DungeonPayoutFile,
  patch: Partial<DungeonPayout>
): DungeonPayoutFile {
  return { ...draft, payout: { ...draft.payout, ...patch } }
}

export function PayoutDetailDrawer({
  draft,
  listItem,
  isDirty,
  savePending,
  deletePending,
  saveError,
  saveOk,
  onChange,
  onFlushSave,
  onDelete,
  onClearSelection,
}: Props) {
  const [exportPending, setExportPending] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  if (!draft) return null

  const p = draft.payout
  const wireStatus = listItem?.wireStatus
  const wired = wireStatus === "wired"
  const wireIssues = listItem?.wireIssues ?? []

  async function onDownloadZip() {
    setExportError(null)
    try {
      await onFlushSave()
    } catch {
      setExportError("Save failed — fix errors before exporting.")
      return
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
    <div className="flex max-h-[min(80vh,40rem)] w-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-border px-1 pb-3">
        <div className="min-w-0 pr-8">
          <h2 className="truncate text-sm font-semibold tracking-wide uppercase">
            Advanced · {p.name}
            {savePending ? (
              <span className="ml-2 font-normal normal-case text-muted-foreground">
                Saving…
              </span>
            ) : isDirty ? (
              <span className="ml-2 font-normal normal-case text-gold-hot">
                Unsaved
              </span>
            ) : null}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {p.id} · inst {p.instanceId}
            {p.family ? ` · ${p.family}` : ""}
          </p>
          <p className="mt-1 text-[0.65rem] text-muted-foreground">
            Day-to-day CP edits stay in the sheet. Use this only for enable,
            clear grants, notes, and export.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end border-b border-border py-2">
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

      <div className="space-y-4 overflow-y-auto py-3 text-sm">
        {wireStatus ? (
          <FormAlert variant={wired ? "success" : "warning"}>
            <p className="font-medium">
              {wireLabel(wireStatus)}
              {listItem?.wireLiveEffect ? ` — ${listItem.wireLiveEffect}` : ""}
            </p>
            {!wired ? (
              <p className="mt-1 text-xs opacity-90">
                CP edits save to the working copy, but clearing this dungeon
                will not grant them until stock loot events{" "}
                <code className="text-[0.7rem]">next</code> into the payout
                AFTER_* hooks (same pattern as Suginami bronze / Phase 13).
              </p>
            ) : null}
            {wireIssues.length ? (
              <ul className="mt-1 list-disc pl-4 text-xs opacity-90">
                {wireIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </FormAlert>
        ) : null}

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
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.enabled}
                disabled={
                  wireStatus != null && wireStatus !== "wired" && !p.enabled
                }
                onChange={(e) =>
                  onChange(updatePayout(draft, { enabled: e.target.checked }))
                }
              />
              Include in Lane A publish package
            </span>
            {wireStatus != null && wireStatus !== "wired" ? (
              <span className="pl-6 text-xs text-muted-foreground">
                Enable is blocked until stock clear loot is mapped to AFTER_*
                (not mapped yet). Refresh catalog after wiring:{" "}
                <code className="text-[0.65rem]">
                  scripts/payout-scan-clear-loot.py
                </code>
              </span>
            ) : (
              <span className="pl-6 text-xs text-muted-foreground">
                Enabled payouts are packaged on Overview → Validate / Publish.
              </span>
            )}
          </label>
        </FieldGroup>

        <div className="rounded-md border border-border/70 bg-muted/20 p-3">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Boss crate drops
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Items in the normal boss crate (machete, gems, reports) are configured
            in Dungeon loot — not here. This payout editor is for instant CP on
            clear and bonus-crate wiring.
          </p>
          <Link
            href={`/admin/dungeon-loot?dungeon=${encodeURIComponent(p.id)}`}
            className="mt-2 inline-flex h-(--density-control-h-sm) items-center rounded-none border border-border bg-muted/40 px-2.5 text-(length:--density-control-text)/relaxed font-semibold hover:border-gold-dim"
          >
            Edit boss crate drops
          </Link>
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
          <FormAlert variant="success">Saved draft.</FormAlert>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={onClearSelection}
        >
          Close
        </Button>
      </div>
    </div>
  )
}
