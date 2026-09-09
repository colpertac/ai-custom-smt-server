import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { reorderShopsSchema } from "@/lib/comp-shop-schema"
import {
  reorderWorkingShops,
  ShopOrderValidationError,
} from "@/lib/comp-shops-fs"
import { requireWebSession } from "@/lib/web-session"

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-shops-reorder", 60, 60_000)
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

  const parsed = reorderShopsSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    const shops = await reorderWorkingShops(parsed.data.shopIds)
    return apiOk(shops, "Reordered")
  } catch (error) {
    if (error instanceof ShopOrderValidationError) {
      return apiFail(error.message, 400, "VALIDATION")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to reorder shops",
      500,
      "SHOPS"
    )
  }
}
