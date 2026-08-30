"use client"

import { CircleHelp } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { ArmoryCombatBonuses } from "@/lib/armory"
import { cn } from "@/lib/utils"

type BonusRow = {
  abbr: string
  title: string
  raw: number | null
  format?: "reduction"
  suffix?: string
}

type CapKind = "proc100" | "reductionIncant" | "reductionCd" | "pursuitPower"

const CAP_REFERENCE: {
  stat: string
  cap: string
  notes: string
}[] = [
  {
    stat: "Crit",
    cap: "None",
    notes: "Raw total used in the crit formula with LUCK and skill rank.",
  },
  {
    stat: "FCC",
    cap: "None",
    notes: "Flat bonus added to crit rate; no stored-value cap.",
  },
  {
    stat: "LBC",
    cap: "100%",
    notes: "Rolls on a successful crit. Values above 100% behave as 100%.",
  },
  {
    stat: "LBP",
    cap: "None",
    notes: "Scales limit break damage; higher always helps.",
  },
  {
    stat: "LB Cap",
    cap: "None",
    notes: "Per-hit damage ceiling (base 30,000 + gear bonus).",
  },
  {
    stat: "TAC",
    cap: "100%",
    notes: "Proc chance on qualifying hits. Above 100% is redundant.",
  },
  {
    stat: "TAP",
    cap: "None",
    notes: "Technical damage can exceed 100% of the triggering hit.",
  },
  {
    stat: "PC",
    cap: "100%",
    notes: "Proc chance on qualifying hits. Above 100% is redundant.",
  },
  {
    stat: "PP",
    cap: "100% (damage)",
    notes: "Pursuit damage is capped at 100% of the hit; extra power does not pass that.",
  },
  {
    stat: "Incant",
    cap: "-100%",
    notes: "Cast-time multiplier floored at 0% (full reduction).",
  },
  {
    stat: "CD",
    cap: "-95%",
    notes: "Cooldown multiplier floored at 5%, not 0% (-100% is not reachable).",
  },
]

function formatTimeReduction(multiplier: number): string {
  return `${multiplier - 100}%`
}

function capKindForRow(abbr: string): CapKind | null {
  switch (abbr) {
    case "LBC":
    case "TAC":
    case "PC":
      return "proc100"
    case "Incant":
      return "reductionIncant"
    case "CD":
      return "reductionCd"
    case "PP":
      return "pursuitPower"
    default:
      return null
  }
}

function isAtCap(raw: number, kind: CapKind): boolean {
  switch (kind) {
    case "proc100":
      return raw >= 100
    case "reductionIncant":
      return raw <= 0
    case "reductionCd":
      return raw <= 5
    case "pursuitPower":
      return raw >= 100
    default:
      return false
  }
}

function buildRows(bonuses: ArmoryCombatBonuses | null): BonusRow[] {
  return [
    { abbr: "Crit", title: "Critical (total)", raw: bonuses?.critical ?? null },
    {
      abbr: "FCC",
      title: "Final crit correction",
      raw: bonuses?.finalCritChance ?? null,
      suffix: "%",
    },
    {
      abbr: "LBC",
      title: "Limit break chance",
      raw: bonuses?.lbChance ?? null,
      suffix: "%",
    },
    {
      abbr: "LBP",
      title: "Limit break power",
      raw: bonuses?.lbDamage ?? null,
      suffix: "%",
    },
    { abbr: "LB Cap", title: "Limit break cap", raw: bonuses?.lbCap ?? null },
    {
      abbr: "TAC",
      title: "Technical attack chance",
      raw: bonuses?.techAttackRate ?? null,
      suffix: "%",
    },
    {
      abbr: "TAP",
      title: "Technical attack power",
      raw: bonuses?.techAttackPower ?? null,
      suffix: "%",
    },
    {
      abbr: "PC",
      title: "Pursuit chance",
      raw: bonuses?.pursuitRate ?? null,
      suffix: "%",
    },
    {
      abbr: "PP",
      title: "Pursuit power",
      raw: bonuses?.pursuitPower ?? null,
      suffix: "%",
    },
    {
      abbr: "Incant",
      title: "Incantation reduction (gear-style; includes INT/SPD)",
      raw: bonuses?.incant ?? null,
      format: "reduction",
    },
    {
      abbr: "CD",
      title: "Cooldown reduction (gear-style; includes VIT/SPD)",
      raw: bonuses?.cooldown ?? null,
      format: "reduction",
    },
  ]
}

export function CombatBonusesStrip({
  bonuses,
  live,
}: {
  bonuses: ArmoryCombatBonuses | null
  live: boolean
}) {
  const rows = buildRows(bonuses)

  return (
    <div className="space-y-1.5 border-t border-border/60 pt-2">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Combat bonuses
        </p>
        <Dialog>
          <DialogTrigger
            type="button"
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Combat bonus caps and notes"
          >
            <CircleHelp className="size-3.5" aria-hidden />
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Combat bonus caps</DialogTitle>
              <DialogDescription>
                Live totals stack gear, crystals, sets, and tokusei the same way
                the channel does. Highlighted values on your profile have hit a
                practical cap — stacking further on that stat does not help.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[min(60vh,24rem)] overflow-auto border border-border/80">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-muted/95">
                  <tr className="border-b border-border/80">
                    <th className="px-2 py-1.5 font-semibold">Stat</th>
                    <th className="px-2 py-1.5 font-semibold">Cap</th>
                    <th className="px-2 py-1.5 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {CAP_REFERENCE.map((row) => (
                    <tr
                      key={row.stat}
                      className="border-b border-border/50 align-top last:border-0"
                    >
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                        {row.stat}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-gold-dim">
                        {row.cap}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {!live ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Log in on channel for live totals (Crit, FCC, LBC, TAC, PC, Incant,
          CD, etc.) from gear and tokusei.
        </p>
      ) : null}
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs tracking-wide uppercase">
        {rows.map((row) => {
          const display =
            row.raw == null
              ? "—"
              : row.format === "reduction"
                ? formatTimeReduction(row.raw)
                : `${row.raw}${row.suffix ?? ""}`
          const isMissing = row.raw == null
          const capKind = row.raw != null ? capKindForRow(row.abbr) : null
          const atCap = capKind != null && row.raw != null && isAtCap(row.raw, capKind)
          const isNeutral =
            !isMissing &&
            !atCap &&
            ((row.format !== "reduction" && row.raw === 0) ||
              (row.format === "reduction" && row.raw === 100))

          return (
            <div key={row.abbr} className="flex gap-1.5">
              <dt className="text-muted-foreground" title={row.title}>
                {row.abbr}
              </dt>
              <dd
                className={cn(
                  "font-medium tabular-nums",
                  isMissing
                    ? "text-muted-foreground/50"
                    : atCap
                      ? "text-gold-hot"
                      : isNeutral
                        ? "text-muted-foreground/60"
                        : "text-foreground"
                )}
                title={
                  atCap
                    ? `${row.title} — at practical cap`
                    : row.title
                }
              >
                {display}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
