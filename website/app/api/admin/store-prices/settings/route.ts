import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  isStoreCartEnabled,
  setStoreCartEnabled,
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

export async function GET() {
  const auth = await requireAdminSession()
  if ("error" in auth && auth.error) return auth.error
  return apiOk({ cartEnabled: isStoreCartEnabled() })
}

const bodySchema = z.object({
  cartEnabled: z.boolean(),
})

export async function PUT(request: Request) {
  const guarded = await guardApiMutation("admin-store-settings", 30, 60_000)
  if (guarded) return guarded

  const auth = await requireAdminSession()
  if ("error" in auth && auth.error) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiFail("cartEnabled boolean required", 400, "VALIDATION")
  }

  const cartEnabled = setStoreCartEnabled(parsed.data.cartEnabled)
  return apiOk({ cartEnabled })
}
