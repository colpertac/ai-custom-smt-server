import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { createShopSchema } from "@/lib/comp-shop-schema"
import {
  createWorkingShop,
  emptyCompShop,
  listWorkingShops,
  ShopConflictError,
  validateCompShop,
} from "@/lib/comp-shops-fs"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const shops = await listWorkingShops()
    return apiOk(shops)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list shops",
      500,
      "SHOPS"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-shops-create", 30, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = createShopSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  const shop = emptyCompShop(parsed.data.shopId, parsed.data.name)
  const issues = validateCompShop(shop, null)
  if (issues.length) {
    return apiFail(issues[0].message, 400, "VALIDATION")
  }

  try {
    await createWorkingShop(shop)
    return apiOk(
      { shopId: shop.shopId, filename: shop.filename },
      "Created",
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof ShopConflictError) {
      return apiFail(error.message, 409, "CONFLICT")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to create shop",
      500,
      "SHOPS"
    )
  }
}
