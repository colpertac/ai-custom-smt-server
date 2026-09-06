import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  getStorePriceFormula,
  setStorePriceFormula,
} from "@/lib/store-prices-store"
import {
  KNOWN_STORE_STAT_IDS,
  normalizeStorePriceFormula,
  type StorePriceFormula,
} from "@/lib/store-pricing"
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

  const formula = getStorePriceFormula()
  return apiOk({
    formula,
    knownStatIds: KNOWN_STORE_STAT_IDS,
  })
}

const formulaSchema = z.object({
  version: z.number().int().positive().optional(),
  minCp: z.number().finite(),
  maxCp: z.number().finite(),
  levelWeight: z.number().finite(),
  categoryBase: z.object({
    weapons: z.number().finite(),
    armor: z.number().finite(),
    items: z.number().finite(),
  }),
  weights: z.record(z.string(), z.number().finite()),
  denylistItemIds: z.array(z.number().int().positive()).optional(),
})

export async function PUT(request: Request) {
  const guarded = await guardApiMutation("admin-store-formula", 30, 60_000)
  if (guarded) return guarded

  const auth = await requireAdminSession()
  if ("error" in auth && auth.error) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = formulaSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid formula",
      400,
      "VALIDATION"
    )
  }

  const saved = setStorePriceFormula(
    normalizeStorePriceFormula(parsed.data as Partial<StorePriceFormula>)
  )
  return apiOk({ formula: saved, knownStatIds: KNOWN_STORE_STAT_IDS })
}
