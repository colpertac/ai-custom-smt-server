/**
 * Default stock treasure APPEND ids (see comp_hack/datastore/data/dropset/treasure.xml).
 * Keys match payout / @dqa slugs.
 */
export const DEFAULT_APPEND_DROPSET: Record<string, number> = {
  "suginami-bronze": 5400,
  "suginami-silver": 5420,
  "suginami-gold": 5480,
  "suginami-bronze-bearcat": 5400,
  "suginami-unknown": 5490,
  "celu-bronze": 5500,
  "celu-silver": 5520,
  "celu-gold": 5530,
  "celu-bronze-bearcat": 5500,
  "celu-per-floor": 5520,
  "quartz-bronze": 5700,
  "quartz-silver": 5710,
  "quartz-gold": 5720,
  "quartz-per-floor": 5720,
  "ichigaya-bronze": 5100,
  "ichigaya-silver": 5120,
  "ichigaya-gold": 5130,
  "ichigaya-2king": 5131,
  "ichigaya-3king": 5132,
  "ichigaya-4king": 5133,
  "ichigaya-assassins": 5134,
  "ichigaya-tokisada": 5135,
  "catacomb-bronze": 6200,
  "catacomb-silver": 6201,
  "catacomb-gold": 6220,
  "nakano-ug-bronze": 9200,
  "nakano-ug-silver": 9220,
  "nakano-ug-gold": 9210,
  "nakano-ug-per-floor": 9220,
  "zhuque-bronze": 6300,
  "zhuque-silver": 6301,
  "zhuque-gold": 6306,
  "zhuque-susanoo": 6304,
  "zhuque-amaterasu-f": 6305,
  "zhuque-amaterasu-m": 6307,
  "mirage-bronze": 10900,
  "mirage-silver": 10902,
  "mirage-gold": 10903,
  "mirage-astaroth": 10904,
  "mirage-ishtar": 10905,
  "amala-maze-black": 9100,
  "distortion-floor": 9100,
  "home-ii": 5300,
  "ice-cave": 10400,
  "old-tokyo-metro": 6900,
  "diaspora-suginami": 7300,
  "diaspora-shinagawa": 7600,
  "ikebukuro-mall": 9100,
  "tmg-lucifuge": 6600,
  "tmg-yantra": 6601,
  "yoidore": 6428,
}

const STACK_BY_DIFFICULTY: Record<string, { min: number; max: number }> = {
  bronze: { min: 100, max: 100 },
  silver: { min: 150, max: 150 },
  gold: { min: 200, max: 200 },
  special: { min: 50, max: 50 },
}

export function defaultReportStacks(
  difficulty?: string
): { minStack: number; maxStack: number } {
  const key = difficulty?.toLowerCase() ?? "bronze"
  const stacks = STACK_BY_DIFFICULTY[key] ?? { min: 80, max: 80 }
  return { minStack: stacks.min, maxStack: stacks.max }
}

export function defaultAppendDropSetId(payoutId: string): number | undefined {
  return DEFAULT_APPEND_DROPSET[payoutId]
}

/** Enabled by default for main tier families (bronze/silver/gold). */
export function defaultReportEnabled(payoutId: string): boolean {
  return (
    payoutId === "mirage-bronze" ||
    /^suginami-(bronze|silver|gold)$/.test(payoutId) ||
    /^celu-(bronze|silver|gold)$/.test(payoutId) ||
    /^quartz-(bronze|silver|gold)$/.test(payoutId)
  )
}

export const REPORT_TRADER_PARTIAL_ID = 90050
