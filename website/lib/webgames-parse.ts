import {
  KINO_PREDICTION_LABELS,
  WEBGAME_SETTINGS_MARKER,
  type KinoSettings,
  type RouletteSettings,
  type SlotSettings,
  type WebGameId,
  type WebGameSettingsMap,
} from "./webgames-types.ts"

export class WebGameParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebGameParseError"
  }
}

function settingsBlock(source: string): string {
  const idx = source.indexOf(WEBGAME_SETTINGS_MARKER)
  if (idx < 0) {
    throw new WebGameParseError(
      `Missing settings marker: ${WEBGAME_SETTINGS_MARKER}`
    )
  }
  return source.slice(0, idx)
}

function requireIntConst(block: string, name: string): number {
  const re = new RegExp(
    `(?:const|local)\\s+${name}\\s*=\\s*(-?\\d+)\\s*;`
  )
  const match = block.match(re)
  if (!match) {
    throw new WebGameParseError(`Missing integer constant ${name}`)
  }
  return Number(match[1])
}

function requireIntArray(block: string, name: string): number[] {
  const re = new RegExp(
    `(?:const|local)\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`
  )
  const match = block.match(re)
  if (!match) {
    throw new WebGameParseError(`Missing integer array ${name}`)
  }
  const body = match[1] ?? ""
  const nums = [...body.matchAll(/-?\d+/g)].map((m) => Number(m[0]))
  if (!nums.length) {
    throw new WebGameParseError(`Empty integer array ${name}`)
  }
  return nums
}

function replaceIntConst(source: string, name: string, value: number): string {
  const re = new RegExp(
    `((?:const|local)\\s+${name}\\s*=\\s*)(-?\\d+)(\\s*;)`
  )
  if (!re.test(source)) {
    throw new WebGameParseError(`Cannot replace integer constant ${name}`)
  }
  return source.replace(re, `$1${value}$3`)
}

function formatIntArray(values: number[], indent = "                        "): string {
  const lines: string[] = []
  for (let i = 0; i < values.length; i += 10) {
    const chunk = values.slice(i, i + 10)
    const prefix = i === 0 ? " " : indent
    const suffix = i + 10 < values.length ? "," : " "
    lines.push(`${prefix}${chunk.join(", ")}${suffix}`)
  }
  return `[${lines.join("\n")}]`
}

function replaceIntArray(source: string, name: string, values: number[]): string {
  const re = new RegExp(
    `((?:const|local)\\s+${name}\\s*=\\s*)\\[[\\s\\S]*?\\](\\s*;)`
  )
  if (!re.test(source)) {
    throw new WebGameParseError(`Cannot replace integer array ${name}`)
  }
  return source.replace(re, `$1${formatIntArray(values)}$2`)
}

export function parseSlotSettings(source: string): SlotSettings {
  const block = settingsBlock(source)
  const reelItemPayout = requireIntArray(block, "REEL_ITEM_PAYOUT")
  if (reelItemPayout.length !== 9) {
    throw new WebGameParseError(
      `REEL_ITEM_PAYOUT must have 9 entries, got ${reelItemPayout.length}`
    )
  }
  return {
    coinCost: requireIntConst(block, "COIN_COST"),
    reelItemPayout,
  }
}

export function parseRouletteSettings(source: string): RouletteSettings {
  const block = settingsBlock(source)
  return {
    coinCost: requireIntConst(block, "COIN_COST"),
    maxDoubleUp: requireIntConst(block, "MAX_DOUBLE_UP"),
    baseJackpot: requireIntConst(block, "BASE_JACKPOT"),
    jackpotMod: requireIntConst(block, "JACKPOT_MOD"),
    jackpotMult: requireIntConst(block, "JACKPOT_MULT"),
  }
}

export function parseKinoSettings(source: string): KinoSettings {
  const block = settingsBlock(source)
  const predictCosts = requireIntArray(block, "PREDICT_COSTS")
  const predictWinnings = requireIntArray(block, "PREDICT_WINNINGS")
  const predictLimits = requireIntArray(block, "PREDICT_LIMITS")
  const n = KINO_PREDICTION_LABELS.length
  if (
    predictCosts.length !== n ||
    predictWinnings.length !== n ||
    predictLimits.length !== n
  ) {
    throw new WebGameParseError(
      `Kino prediction arrays must each have ${n} entries`
    )
  }
  return {
    baseJackpot: requireIntConst(block, "BASE_JACKPOT"),
    predictCosts,
    predictWinnings,
    predictLimits,
  }
}

export function parseWebGameSettings<T extends WebGameId>(
  game: T,
  source: string
): WebGameSettingsMap[T] {
  if (game === "slot") {
    return parseSlotSettings(source) as WebGameSettingsMap[T]
  }
  if (game === "roulette") {
    return parseRouletteSettings(source) as WebGameSettingsMap[T]
  }
  return parseKinoSettings(source) as WebGameSettingsMap[T]
}

export function applySlotSettings(source: string, settings: SlotSettings): string {
  let next = replaceIntConst(source, "COIN_COST", settings.coinCost)
  next = replaceIntArray(next, "REEL_ITEM_PAYOUT", settings.reelItemPayout)
  parseSlotSettings(next)
  return next
}

export function applyRouletteSettings(
  source: string,
  settings: RouletteSettings
): string {
  let next = replaceIntConst(source, "COIN_COST", settings.coinCost)
  next = replaceIntConst(next, "MAX_DOUBLE_UP", settings.maxDoubleUp)
  next = replaceIntConst(next, "BASE_JACKPOT", settings.baseJackpot)
  next = replaceIntConst(next, "JACKPOT_MOD", settings.jackpotMod)
  next = replaceIntConst(next, "JACKPOT_MULT", settings.jackpotMult)
  parseRouletteSettings(next)
  return next
}

export function applyKinoSettings(source: string, settings: KinoSettings): string {
  let next = replaceIntConst(source, "BASE_JACKPOT", settings.baseJackpot)
  next = replaceIntArray(next, "PREDICT_COSTS", settings.predictCosts)
  next = replaceIntArray(next, "PREDICT_WINNINGS", settings.predictWinnings)
  next = replaceIntArray(next, "PREDICT_LIMITS", settings.predictLimits)
  parseKinoSettings(next)
  return next
}

export function applyWebGameSettings<T extends WebGameId>(
  game: T,
  source: string,
  settings: WebGameSettingsMap[T]
): string {
  if (game === "slot") {
    return applySlotSettings(source, settings as SlotSettings)
  }
  if (game === "roulette") {
    return applyRouletteSettings(source, settings as RouletteSettings)
  }
  return applyKinoSettings(source, settings as KinoSettings)
}
