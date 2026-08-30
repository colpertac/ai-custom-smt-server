import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { putShopSchema } from "@/lib/comp-shop-schema"
import {
  deleteWorkingShop,
  readWorkingShop,
  ShopNotFoundError,
  validateCompShop,
  writeWorkingShop,
} from "@/lib/comp-shops-fs"
import {
  loadShopProducts,
  resolveShopProduct,
} from "@/lib/shop-products"
import { persistWebSession, requireWebSession } from "@/lib/web-session"

type Params = { params: Promise<{ shopId: string }> }

async function requireAdminSession() {
  const session = await requireWebSession()
  if (!session) {
    return { error: apiFail("Unauthorized", 401, "UNAUTHORIZED") as Response }
  }
  if (!isAdminLevel(session.userLevel)) {
    return { error: apiFail("Forbidden", 403, "FORBIDDEN") as Response }
  }
  return { session }
}

function parseShopId(raw: string): number | null {
  const n = Number.parseInt(raw, 10)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdminSession()
  if ("error" in auth) return auth.error

  const shopId = parseShopId((await params).shopId)
  if (shopId === null) return apiFail("Invalid shop id", 400, "VALIDATION")

  try {
    const shop = await readWorkingShop(shopId)
    const extract = loadShopProducts()
    const products = extract?.products ?? null
    const preview = shop.tabs.map((tab) => ({
      ...tab,
      products: tab.products.map((p) => ({
        ...p,
        preview: resolveShopProduct(products, p.productId),
      })),
    }))
    await persistWebSession(auth.session)
    return apiOk({
      ...shop,
      tabs: preview,
      productExtractPresent: Boolean(extract),
    })
  } catch (error) {
    if (error instanceof ShopNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to load shop",
      500,
      "SHOPS"
    )
  }
}

export async function PUT(request: Request, { params }: Params) {
  const blocked = await guardApiMutation("admin-shops-put", 60, 60_000)
  if (blocked) return blocked

  const auth = await requireAdminSession()
  if ("error" in auth) return auth.error

  const shopId = parseShopId((await params).shopId)
  if (shopId === null) return apiFail("Invalid shop id", 400, "VALIDATION")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = putShopSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }
  if (parsed.data.shopId !== shopId) {
    return apiFail("shopId mismatch with URL", 400, "VALIDATION")
  }

  let existing
  try {
    existing = await readWorkingShop(shopId)
  } catch (error) {
    if (error instanceof ShopNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    throw error
  }

  const shop = {
    ...parsed.data,
    filename: existing.filename,
    passthrough: parsed.data.passthrough.length
      ? parsed.data.passthrough
      : existing.passthrough,
  }

  const extract = loadShopProducts()
  const known = extract
    ? new Set(Object.keys(extract.products).map((k) => Number(k)))
    : null
  const issues = validateCompShop(shop, known)
  if (issues.length) {
    return apiFail(issues[0].message, 400, "VALIDATION")
  }

  try {
    await writeWorkingShop(shop)
    await persistWebSession(auth.session)
    return apiOk({ shopId, filename: shop.filename })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to save shop",
      500,
      "SHOPS"
    )
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const blocked = await guardApiMutation("admin-shops-delete", 30, 60_000)
  if (blocked) return blocked

  const auth = await requireAdminSession()
  if ("error" in auth) return auth.error

  const shopId = parseShopId((await params).shopId)
  if (shopId === null) return apiFail("Invalid shop id", 400, "VALIDATION")

  try {
    await deleteWorkingShop(shopId)
    await persistWebSession(auth.session)
    return apiOk({ shopId })
  } catch (error) {
    if (error instanceof ShopNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to delete shop",
      500,
      "SHOPS"
    )
  }
}
