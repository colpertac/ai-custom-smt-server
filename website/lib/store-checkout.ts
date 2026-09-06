import {
  adminPostItems,
  authenticate,
  type CompAuthState,
} from "@/lib/comp-api"
import { priceWikiItems, type StoreItemPriceView } from "@/lib/store-price-resolve"
import { findStoreOrder, insertStoreOrder } from "@/lib/store-prices-store"

export const STORE_MAX_CART_LINES = 20
export const STORE_MAX_QTY_PER_LINE = 10
export const STORE_MAX_TOTAL_PRODUCTS = 40
export const STORE_MAX_TOTAL_CP = 100_000

export type StoreCartLine = {
  itemId: number
  qty: number
}

export type StoreCheckoutResult =
  | {
      ok: true
      replay: boolean
      cpCharged: number
      cpRemaining: number | null
      productIds: number[]
      itemIds: number[]
      lines: StoreItemPriceView[]
    }
  | {
      ok: false
      error: string
      code: string
      lines?: StoreItemPriceView[]
      cpCharged?: number
    }

export function getStoreServiceCredentials(): {
  user: string
  password: string
} | null {
  const user = process.env.COMP_ANNOUNCE_USER?.trim()
  const password = process.env.COMP_ANNOUNCE_PASSWORD
  if (!user || password == null || password === "") return null
  return { user, password }
}

export async function authenticateStoreService(): Promise<CompAuthState> {
  const creds = getStoreServiceCredentials()
  if (!creds) {
    throw new Error(
      "COMP_ANNOUNCE_USER / COMP_ANNOUNCE_PASSWORD not configured for store grants"
    )
  }
  return authenticate(creds.user, creds.password)
}

function expandLines(lines: StoreCartLine[]): {
  itemIds: number[]
  priced: StoreItemPriceView[]
  productIds: number[]
  totalCp: number
  error?: { message: string; code: string; lines?: StoreItemPriceView[] }
} {
  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      itemIds: [],
      priced: [],
      productIds: [],
      totalCp: 0,
      error: { message: "Cart is empty", code: "EMPTY_CART" },
    }
  }
  if (lines.length > STORE_MAX_CART_LINES) {
    return {
      itemIds: [],
      priced: [],
      productIds: [],
      totalCp: 0,
      error: {
        message: `Cart may have at most ${STORE_MAX_CART_LINES} lines`,
        code: "CART_TOO_LARGE",
      },
    }
  }

  const normalized: StoreCartLine[] = []
  for (const line of lines) {
    const itemId = Math.floor(Number(line.itemId))
    const qty = Math.floor(Number(line.qty))
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return {
        itemIds: [],
        priced: [],
        productIds: [],
        totalCp: 0,
        error: { message: "Invalid item id in cart", code: "VALIDATION" },
      }
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > STORE_MAX_QTY_PER_LINE) {
      return {
        itemIds: [],
        priced: [],
        productIds: [],
        totalCp: 0,
        error: {
          message: `Quantity must be 1–${STORE_MAX_QTY_PER_LINE}`,
          code: "VALIDATION",
        },
      }
    }
    normalized.push({ itemId, qty })
  }

  const uniqueIds = [...new Set(normalized.map((l) => l.itemId))]
  const pricedById = new Map(
    priceWikiItems(uniqueIds).map((p) => [p.itemId, p])
  )
  const priced = normalized.map((l) => {
    const view = pricedById.get(l.itemId)!
    return view
  })

  for (const line of normalized) {
    const view = pricedById.get(line.itemId)!
    if (!view.sellable || !view.product) {
      return {
        itemIds: [],
        priced,
        productIds: [],
        totalCp: 0,
        error: {
          message: view.reason || `Item #${line.itemId} is not sellable`,
          code: "NOT_SELLABLE",
          lines: priced,
        },
      }
    }
  }

  const productIds: number[] = []
  const itemIds: number[] = []
  let totalCp = 0
  for (const line of normalized) {
    const view = pricedById.get(line.itemId)!
    totalCp += view.cp * line.qty
    for (let i = 0; i < line.qty; i++) {
      productIds.push(view.product!.productId)
      itemIds.push(line.itemId)
    }
  }

  if (productIds.length > STORE_MAX_TOTAL_PRODUCTS) {
    return {
      itemIds,
      priced,
      productIds,
      totalCp,
      error: {
        message: `At most ${STORE_MAX_TOTAL_PRODUCTS} items per checkout`,
        code: "CART_TOO_LARGE",
        lines: priced,
      },
    }
  }
  if (totalCp > STORE_MAX_TOTAL_CP) {
    return {
      itemIds,
      priced,
      productIds,
      totalCp,
      error: {
        message: `Order exceeds max CP (${STORE_MAX_TOTAL_CP})`,
        code: "CP_CAP",
        lines: priced,
      },
    }
  }
  if (totalCp < 0) {
    return {
      itemIds,
      priced,
      productIds,
      totalCp,
      error: { message: "Invalid order total", code: "VALIDATION", lines: priced },
    }
  }

  return { itemIds, priced, productIds, totalCp }
}

/**
 * Server-authoritative checkout: reprice, map products, debit CP + post mail.
 */
export async function checkoutStoreCart(input: {
  username: string
  clientOrderId: string
  lines: StoreCartLine[]
  /** Injected for tests. */
  postItems?: typeof adminPostItems
  authenticate?: () => Promise<CompAuthState>
}): Promise<StoreCheckoutResult> {
  const clientOrderId = input.clientOrderId.trim()
  if (!clientOrderId || clientOrderId.length < 8 || clientOrderId.length > 80) {
    return {
      ok: false,
      error: "Invalid clientOrderId",
      code: "VALIDATION",
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
        productIds: existing.productIds,
        itemIds: existing.itemIds,
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

  const expanded = expandLines(input.lines)
  if (expanded.error) {
    return {
      ok: false,
      error: expanded.error.message,
      code: expanded.error.code,
      lines: expanded.error.lines,
    }
  }

  const { itemIds, priced, productIds, totalCp } = expanded

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
    return { ok: false, error: message, code: "STORE_SERVICE", lines: priced }
  }

  const postFn = input.postItems ?? adminPostItems
  let result: { error: string; cp?: number }
  try {
    result = await postFn(auth, {
      username: input.username,
      products: productIds,
      cp: totalCp,
    })
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
    return { ok: false, error: message, code: "LOBBY_ERROR", lines: priced }
  }

  if (result.error !== "Success") {
    insertStoreOrder({
      clientOrderId,
      username: input.username,
      itemIds,
      productIds,
      cpCharged: totalCp,
      outcome: "error",
      errorMessage: result.error,
    })
    const code =
      result.error === "Not enough CP."
        ? "INSUFFICIENT_CP"
        : result.error.includes("post item")
          ? "MAILBOX_FULL"
          : "LOBBY_REJECT"
    return {
      ok: false,
      error: result.error,
      code,
      lines: priced,
      cpCharged: totalCp,
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

  // Another concurrent request won the insert after we posted — treat as success replay.
  if (!inserted.inserted && inserted.existing?.outcome === "success") {
    return {
      ok: true,
      replay: true,
      cpCharged: inserted.existing.cpCharged,
      cpRemaining: result.cp ?? null,
      productIds: inserted.existing.productIds,
      itemIds: inserted.existing.itemIds,
      lines: priced,
    }
  }

  return {
    ok: true,
    replay: false,
    cpCharged: totalCp,
    cpRemaining: result.cp ?? null,
    productIds,
    itemIds,
    lines: priced,
  }
}
