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

type SheetMode = "cp" | "apples"

export function PublicPayoutsSheet({ rows }: { rows: PublicPayoutRow[] }) {
  const familyRows = useMemo(
    () => groupPayoutsByFamily(asPayoutListItems(rows)),
    [rows]
  )
  const applesById = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const r of rows) map.set(r.id, r.apples)
    return map
  }, [rows])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [sheetMode, setSheetMode] = useState<SheetMode>("cp")

  if (!familyRows.length) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        No dungeon payouts are configured yet.
      </p>
    )
  }

  return (
    <div className="mt-8 space-y-3">
      <div
        className="inline-flex border-2 border-border"
        role="tablist"
        aria-label="Payout sheet mode"
      >
        <button
          type="button"
          role="tab"
          aria-selected={sheetMode === "cp"}
          className={`px-3 py-1.5 text-xs font-semibold tracking-wide uppercase ${
            sheetMode === "cp"
              ? "bg-muted text-foreground"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setSheetMode("cp")}
        >
          CP
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sheetMode === "apples"}
          className={`border-l-2 border-border px-3 py-1.5 text-xs font-semibold tracking-wide uppercase ${
            sheetMode === "apples"
              ? "bg-muted text-foreground"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setSheetMode("apples")}
        >
          Magical Golden Apples
        </button>
      </div>

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
                  sheetMode={sheetMode}
                  applesById={applesById}
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
  sheetMode,
  applesById,
  expanded,
  hasVariants,
  onToggle,
}: {
  row: PayoutFamilyRow
  sheetMode: SheetMode
  applesById: Map<string, number | null>
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
          if (sheetMode === "apples") {
            return (
              <ValueCell
                key={t.key}
                value={item ? (applesById.get(item.id) ?? null) : null}
                title={item?.name}
              />
            )
          }
          return <ValueCell key={t.key} value={item?.cp ?? null} title={item?.name} />
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
                {sheetMode === "apples" ? (
                  <VariantValue
                    value={applesById.get(v.id) ?? null}
                    unit="apples"
                  />
                ) : (
                  <VariantValue value={v.cp} unit="CP" />
                )}
              </td>
            </tr>
          ))
        : null}
    </>
  )
}

function ValueCell({
  value,
  title,
}: {
  value: number | null | undefined
  title?: string
}) {
  if (value == null) {
    return (
      <td className="border-2 border-border bg-background/30 px-2 py-1 text-center text-muted-foreground">
        —
      </td>
    )
  }
  return (
    <td
      className="border-2 border-border px-2 py-1.5 text-center tabular-nums"
      title={title}
    >
      {value}
    </td>
  )
}

function VariantValue({
  value,
  unit,
}: {
  value: number | null
  unit: string
}) {
  if (value == null) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span className="tabular-nums">
      {value} {unit}
    </span>
  )
}
