import { z } from "zod"

export const economyPresetFieldsSchema = z.object({
  label: z.string().trim().min(1).max(80),
  blurb: z.string().trim().max(200).optional().default(""),
  bronze: z.number().finite().min(0).max(1_000_000),
  silver: z.number().finite().min(0).max(1_000_000),
  gold: z.number().finite().min(0).max(1_000_000),
  bearcatMult: z.number().finite().min(0).max(100),
  diaspora: z.number().finite().min(0).max(1_000_000),
  bossMultOfGold: z.number().finite().min(0).max(100),
  special: z.number().finite().min(0).max(1_000_000),
})

export const createEconomyPresetSchema = economyPresetFieldsSchema.extend({
  id: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use kebab-case id (a-z, 0-9, -)")
    .optional(),
})

export const updateEconomyPresetSchema = economyPresetFieldsSchema

export const duplicateEconomyPresetSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
})
