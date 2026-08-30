import type {
  BossCrateDrop,
  ReportRewardDungeon,
  ReportRewardDungeonFile,
  ReportRewardGlobal,
  ReportRewardGlobalFile,
} from "./report-reward-types.ts"
import {
  itemsPerCpFromTradeTiers,
  normalizeCpPackages,
} from "./report-reward-types.ts"

/** Parsed from disk/API before legacy fields are stripped. */
export type ReportRewardDungeonInput = Omit<ReportRewardDungeon, "drops"> & {
  drops?: BossCrateDrop[]
  minStack?: number
  maxStack?: number
  rate?: number
}

export type ReportRewardGlobalInput = Omit<
  ReportRewardGlobal,
  "itemsPerCp" | "cpPackages"
> & {
  itemsPerCp?: number
  cpPackages?: number[]
  tradeTiers?: ReportRewardGlobal["tradeTiers"]
}

export function dungeonBossDrops(
  dungeon: ReportRewardDungeonInput,
  reportItemId: number
): BossCrateDrop[] {
  if (dungeon.drops?.length) {
    return dungeon.drops.map((d) => ({ ...d }))
  }
  return [
    {
      itemId: reportItemId,
      label: "Dungeon report",
      minStack: dungeon.minStack ?? 100,
      maxStack: dungeon.maxStack ?? 100,
      rate: dungeon.rate ?? 100,
      tradableForCp: true,
    },
  ]
}

export function dropsFingerprint(drops: BossCrateDrop[]): string {
  return JSON.stringify(
    [...drops]
      .map((d) => ({
        itemId: d.itemId,
        label: d.label ?? "",
        minStack: d.minStack,
        maxStack: d.maxStack,
        rate: d.rate,
        tradableForCp: Boolean(d.tradableForCp),
      }))
      .sort((a, b) => a.itemId - b.itemId)
  )
}

export function normalizeDungeon(
  dungeon: ReportRewardDungeonInput,
  reportItemId: number
): ReportRewardDungeon {
  const drops = dungeonBossDrops(dungeon, reportItemId)
  const {
    minStack: _minStack,
    maxStack: _maxStack,
    rate: _rate,
    ...rest
  } = dungeon
  return { ...rest, drops }
}

export function normalizeDungeonFile(
  file: {
    version: ReportRewardDungeonFile["version"]
    dungeon: ReportRewardDungeonInput
  },
  reportItemId: number
): ReportRewardDungeonFile {
  return {
    version: file.version,
    dungeon: normalizeDungeon(file.dungeon, reportItemId),
  }
}

export function normalizeGlobal(
  global: ReportRewardGlobalInput
): ReportRewardGlobal {
  const itemsPerCp =
    global.itemsPerCp != null && global.itemsPerCp >= 1
      ? Math.floor(global.itemsPerCp)
      : itemsPerCpFromTradeTiers(global.tradeTiers)
  const fromTiers = global.tradeTiers?.map((t) => t.cp)
  const cpPackages = normalizeCpPackages(
    global.cpPackages?.length ? global.cpPackages : fromTiers
  )
  const { tradeTiers: _tradeTiers, ...rest } = global
  return { ...rest, itemsPerCp, cpPackages }
}

export function normalizeGlobalFile(file: {
  version: ReportRewardGlobalFile["version"]
  global: ReportRewardGlobalInput
}): ReportRewardGlobalFile {
  return {
    version: file.version,
    global: normalizeGlobal(file.global),
  }
}

export function tradableReportItemId(
  dungeon: ReportRewardDungeonInput,
  fallbackReportItemId: number
): number | undefined {
  const marked = dungeonBossDrops(dungeon, fallbackReportItemId).find(
    (d) => d.tradableForCp
  )
  return marked?.itemId
}
