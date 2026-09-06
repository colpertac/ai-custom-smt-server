import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { checkoutStoreCart } from "@/lib/store-checkout"
import { isStoreCartEnabled } from "@/lib/store-prices-store"
import {
  CompSessionMissingError,
  requireWebSession,
} from "@/lib/web-session"

const checkoutSchema = z.object({
  clientOrderId: z.string().trim().min(8).max(80),
  lines: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        qty: z.number().int().min(1).max(10),
      })
    )
    .min(1)
    .max(20),
})

export async function POST(request: Request) {
  const guarded = await guardApiMutation("store-checkout", 10, 60_000)
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

  try {
    const result = await checkoutStoreCart({
      username: session.username,
      clientOrderId: parsed.data.clientOrderId,
      lines: parsed.data.lines,
    })

    if (!result.ok) {
      const status =
        result.code === "INSUFFICIENT_CP"
          ? 402
          : result.code === "UNAUTHORIZED"
            ? 401
            : result.code === "VALIDATION" ||
                result.code === "EMPTY_CART" ||
                result.code === "NOT_SELLABLE" ||
                result.code === "CART_TOO_LARGE" ||
                result.code === "CP_CAP"
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
      productCount: result.productIds.length,
      itemIds: result.itemIds,
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
