import { z } from "zod"

import { REPORT_REWARD_SCHEMA_VERSION } from "./report-reward-types.ts"

const tradeTierSchema = z.object({
  cost: z.number().int().min(1),
  cp: z.number().int().min(1),
  choiceMessageId: z.number().int().min(1).optional(),
})

const traderSchema = z.object({
  label: z.string().min(1).max(120),
  dynamicMapId: z.number().int().min(1),
  npcId: z.number().int().min(1),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
})

export const bossCrateDropSchema = z.object({
  itemId: z.number().int().min(1),
  label: z.string().max(120).optional(),
  minStack: z.number().int().min(1),
  maxStack: z.number().int().min(1),
  rate: z.number().int().min(1).max(100),
  tradableForCp: z.boolean().optional(),
})

export const reportRewardGlobalSchema = z
  .object({
    reportItemId: z.number().int().min(1),
    reportItemLabel: z.string().max(120).optional(),
    eventPrefix: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[A-Za-z0-9_]+$/, "eventPrefix must be alphanumeric/underscore"),
    greetMessageId: z.number().int().min(1),
    promptMessageId: z.number().int().min(1),
    endMessageId: z.number().int().min(1),
    itemsPerCp: z.number().int().min(1).max(1_000_000).optional(),
    /** CP amounts for NPC packages (linear multiples of itemsPerCp). */
    cpPackages: z.array(z.number().int().min(1).max(1_000_000)).max(20).optional(),
    /** @deprecated Prefer itemsPerCp */
    tradeTiers: z.array(tradeTierSchema).max(20).optional(),
    traders: z.array(traderSchema).max(32),
  })
  .superRefine((g, ctx) => {
    if (g.itemsPerCp == null && !(g.tradeTiers?.length)) {
      ctx.addIssue({
        code: "custom",
        message: "itemsPerCp is required",
        path: ["itemsPerCp"],
      })
    }
    if (g.cpPackages != null && g.cpPackages.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Add at least one NPC package",
        path: ["cpPackages"],
      })
    }
  })

export const putReportRewardGlobalSchema = z.object({
  version: z.literal(REPORT_REWARD_SCHEMA_VERSION),
  global: reportRewardGlobalSchema,
})

export const reportRewardDungeonSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/, "id must be lowercase slug"),
    name: z.string().min(1).max(200),
    family: z.string().max(120).optional(),
    difficulty: z.string().max(32).optional(),
    enabled: z.boolean(),
    appendDropSetId: z.number().int().min(1),
    drops: z.array(bossCrateDropSchema).max(32).optional(),
    minStack: z.number().int().min(1).optional(),
    maxStack: z.number().int().min(1).optional(),
    rate: z.number().int().min(1).max(100).optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((p, ctx) => {
    const hasDrops = (p.drops?.length ?? 0) > 0
    const hasLegacy =
      p.minStack != null && p.maxStack != null && p.rate != null
    if (!hasDrops && !hasLegacy) {
      ctx.addIssue({
        code: "custom",
        message: "Add at least one boss crate drop",
        path: ["drops"],
      })
    }
    p.drops?.forEach((d, i) => {
      if (d.maxStack < d.minStack) {
        ctx.addIssue({
          code: "custom",
          message: "maxStack must be ≥ minStack",
          path: ["drops", i, "maxStack"],
        })
      }
    })
  })

export const putReportRewardDungeonSchema = z.object({
  version: z.literal(REPORT_REWARD_SCHEMA_VERSION),
  dungeon: reportRewardDungeonSchema,
})
