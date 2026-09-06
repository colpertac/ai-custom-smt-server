import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { loadWikiItemsPayload } from "@/lib/wiki-catalog-load"
import {
  deleteStorePriceOverride,
  listStorePriceOverrides,
  upsertStorePriceOverride,
} from "@/lib/store-prices-store"
import { requireWebSession } from "@/lib/web-session"

async function requireAdminSession() {
  const session = await requireWebSession()
  if (!session) return { error: apiFail("Unauthorized", 401, "UNAUTHORIZED") }
  if (!isAdminLevel(session.userLevel)) {
    return { error: apiFail("Forbidden", 403, "FORBIDDEN") }
  }
  return { session }
}

function itemName(itemId: number): string | null {
  const item = loadWikiItemsPayload().data.items.find((i) => i.id === itemId)
  return item?.name ?? null
}

export async function GET() {
  const auth = await requireAdminSession()
  if ("error" in auth && auth.error) return auth.error

  const overrides = listStorePriceOverrides().map((row) => ({
    ...row,
    name: itemName(row.itemId),
  }))
  return apiOk({ overrides })
}

const upsertSchema = z.object({
  itemId: z.number().int().positive(),
  cp: z.number().int().min(0).max(1_000_000),
  note: z.string().max(500).optional(),
})

export async function POST(request: Request) {
  const guarded = await guardApiMutation("admin-store-overrides", 60, 60_000)
  if (guarded) return guarded

  const auth = await requireAdminSession()
  if ("error" in auth && auth.error) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid override",
      400,
      "VALIDATION"
    )
  }

  const name = itemName(parsed.data.itemId)
  if (!name) {
    return apiFail("Unknown wiki item id", 400, "UNKNOWN_ITEM")
  }

  const row = upsertStorePriceOverride(parsed.data)
  return apiOk({ override: { ...row, name } })
}

export async function DELETE(request: Request) {
  const guarded = await guardApiMutation("admin-store-overrides-del", 60, 60_000)
  if (guarded) return guarded

  const auth = await requireAdminSession()
  if ("error" in auth && auth.error) return auth.error

  const itemId = Number(new URL(request.url).searchParams.get("itemId"))
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return apiFail("itemId query required", 400, "VALIDATION")
  }

  const deleted = deleteStorePriceOverride(itemId)
  if (!deleted) return apiFail("Override not found", 404, "NOT_FOUND")
  return apiOk({ itemId, deleted: true })
}
