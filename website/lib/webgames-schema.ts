import { z } from "zod"

import { KINO_PREDICTION_LABELS, WEBGAME_IDS } from "./webgames-types.ts"

const nonNegInt = z.number().int().min(0).max(100_000_000)

export const webGameIdSchema = z.enum(WEBGAME_IDS)

export const slotSettingsSchema = z.object({
  coinCost: z.number().int().min(1).max(1_000_000),
  reelItemPayout: z
    .array(nonNegInt)
    .length(9, "REEL_ITEM_PAYOUT must have 9 payouts"),
})

export const rouletteSettingsSchema = z.object({
  coinCost: z.number().int().min(1).max(1_000_000),
  maxDoubleUp: z.number().int().min(0).max(10),
  baseJackpot: nonNegInt,
  jackpotMod: z.number().int().min(1).max(100_000_000),
  jackpotMult: z.number().int().min(1).max(1_000_000),
})

const kinoLen = KINO_PREDICTION_LABELS.length

export const kinoSettingsSchema = z.object({
  baseJackpot: nonNegInt,
  predictCosts: z
    .array(nonNegInt)
    .length(kinoLen, `PREDICT_COSTS must have ${kinoLen} entries`),
  predictWinnings: z
    .array(nonNegInt)
    .length(kinoLen, `PREDICT_WINNINGS must have ${kinoLen} entries`),
  predictLimits: z
    .array(z.number().int().min(0).max(1000))
    .length(kinoLen, `PREDICT_LIMITS must have ${kinoLen} entries`),
})

export const webGameSettingsBodySchema = z.discriminatedUnion("game", [
  z.object({ game: z.literal("slot"), settings: slotSettingsSchema }),
  z.object({ game: z.literal("roulette"), settings: rouletteSettingsSchema }),
  z.object({ game: z.literal("kino"), settings: kinoSettingsSchema }),
])
