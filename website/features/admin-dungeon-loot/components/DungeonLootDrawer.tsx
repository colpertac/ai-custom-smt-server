"use client"

import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  REPORT_REWARD_SCHEMA_VERSION,
  type BossCrateDrop,
  type ReportRewardDungeonFile,
  type ReportRewardListItem,
} from "@/lib/report-reward-types"

const COMPACT =
  "h-7 w-full min-w-0 px-1.5 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"

type Props = {
  draft: ReportRewardDungeonFile
  listItem?: ReportRewardListItem | null
  saveError: string | null
  saveOk: boolean
  onChange: (next: ReportRewardDungeonFile) => void
  onFlushSave: () => void | Promise<void>
  onClearSelection: () => void
}

function HeaderTip({ label, tip }: { label: string; tip: string }) {
  return (
    <th className="py-1 pr-1 font-medium">
      <Tooltip>
        <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-2">
          {label}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {tip}
        </TooltipContent>
      </Tooltip>
    </th>
  )
}

function updateDungeon(
  draft: ReportRewardDungeonFile,
  patch: Partial<ReportRewardDungeonFile["dungeon"]>
): ReportRewardDungeonFile {
  return {
    version: REPORT_REWARD_SCHEMA_VERSION,
    dungeon: { ...draft.dungeon, ...patch },
  }
}

function updateDrop(
  drops: BossCrateDrop[],
  index: number,
  patch: Partial<BossCrateDrop>
): BossCrateDrop[] {
  const next = [...drops]
  next[index] = { ...next[index]!, ...patch }
  return next
}

export function DungeonLootDrawer({
  draft,
  listItem,
  saveError,
  saveOk,
  onChange,
  onFlushSave,
  onClearSelection,
}: Props) {
  const d = draft.dungeon

  return (
    <TooltipProvider delay={200}>
    <aside className="flex max-h-[calc(100vh-8rem)] w-full flex-col border-2 border-border bg-card lg:w-[28rem] lg:shrink-0">
      <div className="flex items-start justify-between gap-2 border-b-2 border-border px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Boss crate loot
          </h2>
          <p className="text-xs text-muted-foreground">{d.name}</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClearSelection}>
          Close
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <FieldGroup>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={d.enabled}
              onChange={(e) =>
                onChange(updateDungeon(draft, { enabled: e.target.checked }))
              }
            />
            <span>
              <span className="font-medium">Live for this dungeon</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                When enabled, drops below are added to the normal boss crate
                after you publish from Overview.
              </span>
            </span>
          </label>
        </FieldGroup>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Drops in boss crate
              </h3>
              <p className="text-[0.65rem] text-muted-foreground">
                Item id + how many can drop (min–max) and chance.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange(
                  updateDungeon(draft, {
                    drops: [
                      ...d.drops,
                      {
                        itemId: 1,
                        label: "",
                        minStack: 1,
                        maxStack: 1,
                        rate: 100,
                      },
                    ],
                  })
                )
              }
            >
              <Plus data-icon="inline-start" />
              Add drop
            </Button>
          </div>
          <table className="w-full table-fixed border-collapse text-left text-xs">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[26%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1 pr-1 font-medium">Item id</th>
                <th className="py-1 pr-1 font-medium">Label</th>
                <HeaderTip
                  label="Min"
                  tip="Lowest stack size if this item drops"
                />
                <HeaderTip
                  label="Max"
                  tip="Highest stack size if this item drops"
                />
                <HeaderTip
                  label="Chance"
                  tip="Drop chance 1–100 (100 = always)"
                />
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {d.drops.map((drop, i) => (
                <tr key={i} className="border-b border-border/50 align-top">
                  <td className="py-1 pr-1">
                    <Input
                      className={COMPACT}
                      type="number"
                      value={drop.itemId}
                      onChange={(e) =>
                        onChange(
                          updateDungeon(draft, {
                            drops: updateDrop(d.drops, i, {
                              itemId: Number(e.target.value) || 1,
                            }),
                          })
                        )
                      }
                    />
                  </td>
                  <td className="py-1 pr-1">
                    <Input
                      className={COMPACT}
                      value={drop.label ?? ""}
                      placeholder="e.g. Machete"
                      onChange={(e) =>
                        onChange(
                          updateDungeon(draft, {
                            drops: updateDrop(d.drops, i, {
                              label: e.target.value,
                            }),
                          })
                        )
                      }
                    />
                  </td>
                  <td className="py-1 pr-1">
                    <Input
                      className={COMPACT}
                      type="number"
                      min={1}
                      value={drop.minStack}
                      aria-label="Min stack"
                      onChange={(e) =>
                        onChange(
                          updateDungeon(draft, {
                            drops: updateDrop(d.drops, i, {
                              minStack: Number(e.target.value) || 1,
                            }),
                          })
                        )
                      }
                    />
                  </td>
                  <td className="py-1 pr-1">
                    <Input
                      className={COMPACT}
                      type="number"
                      min={1}
                      value={drop.maxStack}
                      aria-label="Max stack"
                      onChange={(e) =>
                        onChange(
                          updateDungeon(draft, {
                            drops: updateDrop(d.drops, i, {
                              maxStack: Number(e.target.value) || 1,
                            }),
                          })
                        )
                      }
                    />
                  </td>
                  <td className="py-1 pr-1">
                    <Input
                      className={COMPACT}
                      type="number"
                      min={1}
                      max={100}
                      value={drop.rate}
                      aria-label="Drop chance"
                      onChange={(e) =>
                        onChange(
                          updateDungeon(draft, {
                            drops: updateDrop(d.drops, i, {
                              rate: Number(e.target.value) || 1,
                            }),
                          })
                        )
                      }
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
                          updateDungeon(draft, {
                            drops: d.drops.filter((_, j) => j !== i),
                          })
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
              {!d.drops.length ? (
                <tr>
                  <td colSpan={6} className="py-3 text-muted-foreground">
                    No drops yet — add an item id (e.g. machete, gem, report).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded-md border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-medium text-foreground">Tradable for CP</p>
          <p className="mt-1 text-[0.65rem] text-muted-foreground">
            Mark one drop if players should turn it in at the CP exchange NPC
            (rates configured below).
          </p>
          <div className="mt-2 space-y-1.5">
            {d.drops.map((drop, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <input
                  type="radio"
                  name={`tradable-${d.id}`}
                  checked={Boolean(drop.tradableForCp)}
                  onChange={() =>
                    onChange(
                      updateDungeon(draft, {
                        drops: d.drops.map((row, j) => ({
                          ...row,
                          tradableForCp: j === i,
                        })),
                      })
                    )
                  }
                />
                <span>
                  {drop.label?.trim() || `Item ${drop.itemId}`}
                  <span className="text-muted-foreground"> ({drop.itemId})</span>
                </span>
              </label>
            ))}
            {d.drops.length ? (
              <button
                type="button"
                className="text-[0.65rem] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() =>
                  onChange(
                    updateDungeon(draft, {
                      drops: d.drops.map((row) => ({
                        ...row,
                        tradableForCp: false,
                      })),
                    })
                  )
                }
              >
                None tradable
              </button>
            ) : null}
          </div>
        </div>

        {listItem ? (
          <p className="text-[0.65rem] text-muted-foreground">
            {listItem.dropCount} drop(s) configured
          </p>
        ) : null}

        {saveError ? <FormAlert variant="error">{saveError}</FormAlert> : null}
        {saveOk ? (
          <FormAlert variant="success">Saved draft.</FormAlert>
        ) : null}

        <p className="text-[0.65rem] text-muted-foreground">
          Need instant CP on clear instead of trading? Use{" "}
          <Link href="/admin/payouts" className="text-cyan-300 hover:underline">
            Payouts
          </Link>{" "}
          (advanced wiring).
        </p>
      </div>

      <div className="mt-auto border-t-2 border-border p-3">
        <Button type="button" size="sm" variant="outline" onClick={() => void onFlushSave()}>
          Save now
        </Button>
      </div>
    </aside>
    </TooltipProvider>
  )
}
