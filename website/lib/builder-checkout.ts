import {
  adminGrantCustomItems,
  adminPostItems,
  type CompAuthState,
  type CustomPostGrantItem,
} from "@/lib/comp-api"
import {
  authenticateStoreService,
  getStoreServiceCredentials,
} from "@/lib/store-checkout"
import { findStoreOrder, insertStoreOrder } from "@/lib/store-prices-store"
import { priceBuilderLoadout } from "@/lib/builder-pricing"
import type { PlannerSlot } from "@/lib/gear-planner-combat"

export type BuilderCheckoutResult =
  | {
      ok: true
      replay: boolean
      cpCharged: number
      cpRemaining: number | null
      pieceCount: number
      warnings: string[]
      lines: {
        slotLabel: string
        s1ItemId: number
        name: string
        cp: number
      }[]
    }
  | {
      ok: false
      error: string
      code: string
      warnings?: string[]
      cpCharged?: number
      lines?: {
        slotLabel: string
        s1ItemId: number
        name: string
        cp: number
      }[]
    }

function toCustomPayload(grants: CustomPostGrantItem[]): CustomPostGrantItem[] {
  return grants.map((g) => ({
    productId: g.productId,
    basicEffect: g.basicEffect || undefined,
    specialEffect: g.specialEffect || undefined,
    tarot: g.tarot || undefined,
    soul: g.soul || undefined,
  }))
}

/**
 * Server-authoritative builder checkout: reprice loadout, debit CP, post
 * fused/stock pieces to the account mailbox.
 */
export async function checkoutBuilderLoadout(input: {
  username: string
  clientOrderId: string
  loadout: PlannerSlot[]
  grantCustom?: typeof adminGrantCustomItems
  postItems?: typeof adminPostItems
  authenticate?: () => Promise<CompAuthState>
}): Promise<BuilderCheckoutResult> {
  const clientOrderId = input.clientOrderId.trim()
  if (!clientOrderId || clientOrderId.length < 8 || clientOrderId.length > 80) {
    return {
      ok: false,
      error: "Invalid clientOrderId",
      code: "VALIDATION",
    }
  }

  if (!getStoreServiceCredentials()) {
    return {
      ok: false,
      error: "Store grant service is not configured",
      code: "STORE_SERVICE",
    }
  }

  const existing = findStoreOrder(clientOrderId)
  if (existing) {
    if (existing.username !== input.username.toLowerCase()) {
      return {
        ok: false,
        error: "Order id already used",
        code: "ORDER_CONFLICT",
      }
    }
    if (existing.outcome === "success" || existing.outcome === "replay") {
      return {
        ok: true,
        replay: true,
        cpCharged: existing.cpCharged,
        cpRemaining: null,
        pieceCount: existing.productIds.length,
        warnings: [],
        lines: [],
      }
    }
    return {
      ok: false,
      error: existing.errorMessage || "Previous order failed",
      code: "ORDER_FAILED",
      cpCharged: existing.cpCharged,
    }
  }

  const quote = priceBuilderLoadout(input.loadout)
  if (!quote.ok) {
    return {
      ok: false,
      error: quote.error,
      code: quote.code,
      warnings: quote.warnings,
      lines: quote.lines?.map((l) => ({
        slotLabel: l.slotLabel,
        s1ItemId: l.s1ItemId,
        name: l.name,
        cp: l.cp,
      })),
    }
  }

  const lineSummary = quote.lines.map((l) => ({
    slotLabel: l.slotLabel,
    s1ItemId: l.s1ItemId,
    name: l.name,
    cp: l.cp,
  }))
  const productIds = quote.grants.map((g) => g.productId)
  const itemIds = quote.grants.map((g) => g.s1ItemId)
  const totalCp = quote.totalCp

  let auth: CompAuthState
  try {
    auth = await (input.authenticate ?? authenticateStoreService)()
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Store service unavailable"
    insertStoreOrder({
      clientOrderId,
      username: input.username,
      itemIds,
      productIds,
      cpCharged: totalCp,
      outcome: "error",
      errorMessage: message,
    })
    return {
      ok: false,
      error: message,
      code: "STORE_SERVICE",
      warnings: quote.warnings,
      lines: lineSummary,
    }
  }

  const grantFn = input.grantCustom ?? adminGrantCustomItems
  const postFn = input.postItems ?? adminPostItems

  // Charge all CP on the first lobby call that actually posts something.
  // Prefer custom grant when present; otherwise stock post_items.
  try {
    let cpRemaining: number | null = null

    if (quote.customGrants.length > 0) {
      const customResult = await grantFn(auth, {
        username: input.username,
        items: toCustomPayload(quote.customGrants),
        cp: totalCp,
      })
      if (customResult.error !== "Success") {
        insertStoreOrder({
          clientOrderId,
          username: input.username,
          itemIds,
          productIds,
          cpCharged: totalCp,
          outcome: "error",
          errorMessage: customResult.error,
        })
        const code =
          customResult.error === "Not enough CP."
            ? "INSUFFICIENT_CP"
            : customResult.error.includes("post item")
              ? "MAILBOX_FULL"
              : "LOBBY_REJECT"
        return {
          ok: false,
          error: customResult.error,
          code,
          warnings: quote.warnings,
          lines: lineSummary,
          cpCharged: totalCp,
        }
      }
      cpRemaining = customResult.cp ?? null

      if (quote.stockProductIds.length > 0) {
        const stockResult = await postFn(auth, {
          username: input.username,
          products: quote.stockProductIds,
          cp: 0,
        })
        if (stockResult.error !== "Success") {
          // Custom pieces already posted and CP already taken — record error
          // so support can reconcile; do not retry as success.
          insertStoreOrder({
            clientOrderId,
            username: input.username,
            itemIds,
            productIds,
            cpCharged: totalCp,
            outcome: "error",
            errorMessage: `Partial grant: custom ok, stock failed: ${stockResult.error}`,
          })
          return {
            ok: false,
            error: `Custom pieces mailed but stock grant failed: ${stockResult.error}`,
            code: "PARTIAL_GRANT",
            warnings: quote.warnings,
            lines: lineSummary,
            cpCharged: totalCp,
          }
        }
        if (stockResult.cp != null) cpRemaining = stockResult.cp
      }
    } else if (quote.stockProductIds.length > 0) {
      const stockResult = await postFn(auth, {
        username: input.username,
        products: quote.stockProductIds,
        cp: totalCp,
      })
      if (stockResult.error !== "Success") {
        insertStoreOrder({
          clientOrderId,
          username: input.username,
          itemIds,
          productIds,
          cpCharged: totalCp,
          outcome: "error",
          errorMessage: stockResult.error,
        })
        const code =
          stockResult.error === "Not enough CP."
            ? "INSUFFICIENT_CP"
            : stockResult.error.includes("post item")
              ? "MAILBOX_FULL"
              : "LOBBY_REJECT"
        return {
          ok: false,
          error: stockResult.error,
          code,
          warnings: quote.warnings,
          lines: lineSummary,
          cpCharged: totalCp,
        }
      }
      cpRemaining = stockResult.cp ?? null
    } else {
      return {
        ok: false,
        error: "Nothing to purchase",
        code: "EMPTY_LOADOUT",
        warnings: quote.warnings,
      }
    }

    const inserted = insertStoreOrder({
      clientOrderId,
      username: input.username,
      itemIds,
      productIds,
      cpCharged: totalCp,
      outcome: "success",
    })

    if (!inserted.inserted && inserted.existing?.outcome === "success") {
      return {
        ok: true,
        replay: true,
        cpCharged: inserted.existing.cpCharged,
        cpRemaining,
        pieceCount: inserted.existing.productIds.length,
        warnings: quote.warnings,
        lines: lineSummary,
      }
    }

    return {
      ok: true,
      replay: false,
      cpCharged: totalCp,
      cpRemaining,
      pieceCount: productIds.length,
      warnings: quote.warnings,
      lines: lineSummary,
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Mailbox grant failed"
    insertStoreOrder({
      clientOrderId,
      username: input.username,
      itemIds,
      productIds,
      cpCharged: totalCp,
      outcome: "error",
      errorMessage: message,
    })
    return {
      ok: false,
      error: message,
      code: "LOBBY_ERROR",
      warnings: quote.warnings,
      lines: lineSummary,
    }
  }
}
