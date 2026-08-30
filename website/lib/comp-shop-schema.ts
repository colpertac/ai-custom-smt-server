import { z } from "zod"

const passthroughSchema = z.object({
  name: z.string().min(1),
  content: z.string(),
  complex: z.boolean(),
})

const productSchema = z.object({
  productId: z.number().int().positive(),
  basePrice: z.number().int().min(0),
  merchantDescription: z.string().optional(),
  moonRestrict: z.string().optional(),
  passthrough: z.array(passthroughSchema).default([]),
})

const tabSchema = z.object({
  name: z.string().min(1).max(128),
  products: z.array(productSchema),
  passthrough: z.array(passthroughSchema).default([]),
})

export const putShopSchema = z.object({
  shopId: z.number().int().positive(),
  name: z.string().min(1).max(128),
  type: z.string().min(1).max(32).default("COMP_SHOP"),
  tabs: z.array(tabSchema).max(100),
  passthrough: z.array(passthroughSchema).default([]),
  filename: z.string().optional(),
})

export const createShopSchema = z.object({
  shopId: z.number().int().positive(),
  name: z.string().trim().min(1).max(128),
})

export type PutShopBody = z.infer<typeof putShopSchema>
export type CreateShopBody = z.infer<typeof createShopSchema>
