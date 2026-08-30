import { z } from "zod"

const crateDropSchema = z.object({
  itemId: z.number().int().positive(),
  minStack: z.number().int().min(1),
  maxStack: z.number().int().min(1),
  rate: z.number().int().min(0),
  mutexId: z.number().int().positive().nullable().optional(),
})

const clearItemSchema = z.object({
  itemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
})

const hooksSchema = z.object({
  afterNormalLootEventId: z.string().min(1).max(64),
  afterFiendLootEventId: z.string().min(1).max(64),
  bonusEventId: z.string().min(1).max(64),
  bonusFiendEventId: z.string().min(1).max(64),
  resumeNormalNext: z.string().min(1).max(64),
})

export const dungeonPayoutSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must be kebab-case"),
    name: z.string().trim().min(1).max(128),
    description: z.string().max(500).optional(),
    family: z.string().max(64).optional(),
    difficulty: z.enum(["bronze", "silver", "gold", "special"]).optional(),
    mode: z
      .enum(["normal", "bearcat", "boss", "diaspora", "other"])
      .optional(),
    variantLabel: z.string().max(64).optional(),
    notes: z.string().max(1000).optional(),
    enabled: z.boolean(),
    instanceId: z.number().int().positive(),
    dedupFlag: z.number().int().positive(),
    bossGroupId: z.number().int().positive(),
    dropSetId: z.number().int().positive(),
    spotId: z.number().int().positive(),
    crateCount: z.number().int().min(1).max(20),
    cp: z.number().int().min(0).max(10000),
    crateDrops: z.array(crateDropSchema).max(64),
    clearItems: z.array(clearItemSchema).max(16),
    hooks: hooksSchema,
  })
  .superRefine((p, ctx) => {
    p.crateDrops.forEach((d, i) => {
      if (d.maxStack < d.minStack) {
        ctx.addIssue({
          code: "custom",
          path: ["crateDrops", i, "maxStack"],
          message: "maxStack must be ≥ minStack",
        })
      }
    })
    const seenItems = new Set<number>()
    for (const d of p.crateDrops) {
      if (seenItems.has(d.itemId)) {
        ctx.addIssue({
          code: "custom",
          path: ["crateDrops"],
          message: `Duplicate crate itemId ${d.itemId}`,
        })
        break
      }
      seenItems.add(d.itemId)
    }
    const seenClear = new Set<number>()
    for (const c of p.clearItems) {
      if (seenClear.has(c.itemId)) {
        ctx.addIssue({
          code: "custom",
          path: ["clearItems"],
          message: `Duplicate clear itemId ${c.itemId}`,
        })
        break
      }
      seenClear.add(c.itemId)
    }
  })

export const putPayoutSchema = z.object({
  version: z.literal(1),
  payout: dungeonPayoutSchema,
})

export const createPayoutSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must be kebab-case"),
  name: z.string().trim().min(1).max(128),
  instanceId: z.number().int().positive(),
})
