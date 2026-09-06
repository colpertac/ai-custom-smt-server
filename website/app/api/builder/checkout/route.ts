import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { checkoutBuilderLoadout } from "@/lib/builder-checkout"
import { priceBuilderLoadout } from "@/lib/builder-pricing"
import { emptyPlannerLoadout, type PlannerSlot } from "@/lib/gear-planner-combat"
import { isStoreCartEnabled } from "@/lib/store-prices-store"
import {
  CompSessionMissingError,
  requireWebSession,
} from "@/lib/web-session"

const slotSchema = z.object({
  slot: z.string(),
  label: z.string(),
  index: z.number().int(),
  s1ItemId: z.number().int().positive().nullable(),
  sitemItemId: z.number().int().positive().nullable(),
  s2ItemId: z.number().int().positive().nullable(),
  s3ItemId: z.number().int().positive().nullable(),
  tarotEnchantId: z.number().int().nullable(),
  soulEnchantId: z.number().int().nullable(),
})

const checkoutSchema = z.object({
  clientOrderId: z.string().trim().min(8).max(80),
  loadout: z.array(slotSchema).min(1).max(15),
})

function normalizeLoadout(
  raw: z.infer<typeof slotSchema>[]
): PlannerSlot[] {
  const base = emptyPlannerLoadout()
  const byIndex = new Map(raw.map((s) => [s.index, s]))
  return base.map((slot) => {
    const incoming = byIndex.get(slot.index)
    if (!incoming) return slot
    return {
      ...slot,
      s1ItemId: incoming.s1ItemId,
      sitemItemId: incoming.sitemItemId,
      s2ItemId: incoming.s2ItemId,
      s3ItemId: incoming.s3ItemId,
      tarotEnchantId: incoming.tarotEnchantId,
      soulEnchantId: incoming.soulEnchantId,
    }
  })
}

export async function POST(request: Request) {
  const guarded = await guardApiMutation("builder-checkout", 8, 60_000)
  if (guarded) return guarded

  if (!isStoreCartEnabled()) {
    return apiFail("Web store is currently disabled", 403, "STORE_DISABLED")
  }

  const session = await requireWebSession()
  if (!session) {
    return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = checkoutSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid checkout payload",
      400,
      "VALIDATION"
    )
  }

  const loadout = normalizeLoadout(parsed.data.loadout)

  try {
    const result = await checkoutBuilderLoadout({
      username: session.username,
      clientOrderId: parsed.data.clientOrderId,
      loadout,
    })

    if (!result.ok) {
      const status =
        result.code === "INSUFFICIENT_CP"
          ? 402
          : result.code === "UNAUTHORIZED"
            ? 401
            : result.code === "VALIDATION" ||
                result.code === "EMPTY_LOADOUT" ||
                result.code === "NOT_SELLABLE" ||
                result.code === "TOO_MANY_PIECES" ||
                result.code === "CP_CAP" ||
                result.code === "NO_PRODUCT" ||
                result.code === "EMPTY_SLOT"
              ? 400
              : result.code === "STORE_SERVICE"
                ? 503
                : 400
      return apiFail(result.error, status, result.code)
    }

    return apiOk({
      replay: result.replay,
      cpCharged: result.cpCharged,
      cpRemaining: result.cpRemaining,
      pieceCount: result.pieceCount,
      warnings: result.warnings,
      lines: result.lines,
    })
  } catch (err) {
    if (err instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      err instanceof Error ? err.message : "Checkout failed",
      500,
      "CHECKOUT_ERROR"
    )
  }
}

/** Quote CP for the current loadout without purchasing. */
export async function PUT(request: Request) {
  if (!isStoreCartEnabled()) {
    return apiFail("Web store is currently disabled", 403, "STORE_DISABLED")
  }

  const session = await requireWebSession()
  if (!session) {
    return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = z
    .object({ loadout: z.array(slotSchema).min(1).max(15) })
    .safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid quote payload",
      400,
      "VALIDATION"
    )
  }

  const quote = priceBuilderLoadout(normalizeLoadout(parsed.data.loadout))
  if (!quote.ok) {
    return apiFail(quote.error, 400, quote.code)
  }

  return apiOk({
    totalCp: quote.totalCp,
    warnings: quote.warnings,
    lines: quote.lines,
    customCount: quote.customGrants.length,
    stockCount: quote.stockProductIds.length,
  })
}
