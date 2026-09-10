export const WEBGAME_IDS = ["slot", "roulette", "kino"] as const
export type WebGameId = (typeof WEBGAME_IDS)[number]

export const WEBGAME_SETTINGS_MARKER =
  "/*** DO NOT MODIFY BELOW THIS POINT ***/"

/** Kino prediction indexes — matches const order in kino.nut */
export const KINO_PREDICTION_LABELS = [
  "All 7s",
  "All 1s",
  "All 6s",
  "Sum 19",
  "Sum 4",
  "Sum 5",
  "Sum 16",
  "Sum 7",
  "Sum 14",
  "Sum 12",
  "All same number",
  "All angel",
  "All human",
  "Has non-fallen",
  "Has angel captain",
  "Order L-N-C",
  "Empty 10",
  "Coin multiplier",
  "Coin per turn",
  "Loss guard",
  "Easy angel captain",
  "Easy any captain",
  "Easy angel",
  "Has no fallen captain",
] as const

export type SlotSettings = {
  coinCost: number
  reelItemPayout: number[]
}

export type RouletteSettings = {
  coinCost: number
  maxDoubleUp: number
  baseJackpot: number
  jackpotMod: number
  jackpotMult: number
}

export type KinoSettings = {
  baseJackpot: number
  predictCosts: number[]
  predictWinnings: number[]
  predictLimits: number[]
}

export type WebGameSettingsMap = {
  slot: SlotSettings
  roulette: RouletteSettings
  kino: KinoSettings
}

export type WebGameFilePayload<T extends WebGameId = WebGameId> = {
  game: T
  path: string
  settings: WebGameSettingsMap[T]
  restartPending: boolean
}
