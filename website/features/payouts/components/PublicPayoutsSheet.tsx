"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import {
  groupPayoutsByFamily,
  variantDisplayLabel,
  type PayoutFamilyRow,
  type SheetDifficulty,
} from "@/features/admin-payouts/groupPayouts"
import {
  asPayoutListItems,
  type PublicPayoutRow,
} from "@/lib/public-payout-types"
import { Button } from "@/components/ui/button"
import type { PayoutListItem } from "@/lib/dungeon-payout-types"

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

export function PublicPayoutsSheet({ rows }: { rows: PublicPayoutRow[] }) {
  const familyRows = useMemo(
    () => groupPayoutsByFamily(asPayoutListItems(rows)),
    [rows]
  )
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (!familyRows.length) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        No dungeon payouts are configured yet.
      </p>
    )
  }

  return (
    <div className="mt-8 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const next: Record<string, boolean> = {}
            for (const r of familyRows) {
              if (r.variants.length) next[r.family] = true
            }
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
      </div>

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
                  row={row}
                  expanded={open}
                  hasVariants={hasVariants}
                  onToggle={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [row.family]: !prev[row.family],
                    }))
                  }
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FamilyBlock({
  row,
  expanded,
  hasVariants,
  onToggle,
}: {
  row: PayoutFamilyRow
  expanded: boolean
  hasVariants: boolean
  onToggle: () => void
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
            aria-expanded={hasVariants ? expanded : undefined}
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
            <span className="truncate">{row.family}</span>
            {hasVariants ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({row.variants.length})
              </span>
            ) : null}
          </button>
        </td>
        {TIERS.map((t) => {
          const item =
            t.key === "bronze"
              ? row.bronze
              : t.key === "silver"
                ? row.silver
                : row.gold
          return <CpCell key={t.key} item={item} />
        })}
      </tr>
      {expanded
        ? row.variants.map((v) => (
            <tr key={v.id} className="bg-muted/20">
                    <td className="sticky left-0 z-[1] border-2 border-border bg-muted/40 px-2 py-1 pl-7 text-xs text-muted-foreground">
                <span className="text-foreground">
                  {variantDisplayLabel(v)}
                </span>
                {v.mode && v.mode !== "normal" ? (
                  <span className="ml-1 opacity-70">· {v.mode}</span>
                ) : null}
              </td>
              <td
                colSpan={3}
                className="border-2 border-border px-2 py-1 text-center"
              >
                <span className="tabular-nums">{v.cp} CP</span>
              </td>
            </tr>
          ))
        : null}
    </>
  )
}

function CpCell({ item }: { item?: PayoutListItem }) {
  if (!item) {
    return (
      <td className="border-2 border-border bg-background/30 px-2 py-1 text-center text-muted-foreground">
        —
      </td>
    )
  }
  return (
    <td
      className="border-2 border-border px-2 py-1.5 text-center tabular-nums"
      title={item.name}
    >
      {item.cp}
    </td>
  )
}
