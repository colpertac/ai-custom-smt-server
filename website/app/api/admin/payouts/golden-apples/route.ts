import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { batchGoldenApplesSchema } from "@/lib/dungeon-payout-schema"
import {
  GoldenAppleConfigError,
  listGoldenAppleLinks,
  updateGoldenApplesBatch,
} from "@/lib/golden-apple-fs"
import { requireWebSession } from "@/lib/web-session"

async function requireAdmin() {
  const session = await requireWebSession()
  if (!session) {
    return { error: apiFail("Unauthorized", 401, "UNAUTHORIZED") as Response }
  }
  if (!isAdminLevel(session.userLevel)) {
    return { error: apiFail("Forbidden", 403, "FORBIDDEN") as Response }
  }
  return { session }
}

export async function GET() {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  try {
    const { path, links, partials } = await listGoldenAppleLinks()
    const byPayoutId: Record<
      string,
      {
        apples: number | null
        partialId: number | null
        sharedWith: string[]
        dynamicMapIds: number[]
      }
    > = {}
    for (const link of links) {
      byPayoutId[link.payoutId] = {
        apples: link.apples,
        partialId: link.partialId,
        sharedWith: link.sharedWith,
        dynamicMapIds: link.dynamicMapIds,
      }
    }
    return apiOk({
      path,
      byPayoutId,
      partialCount: partials.length,
    })
  } catch (error) {
    const status = error instanceof GoldenAppleConfigError ? 404 : 500
    return apiFail(
      error instanceof Error ? error.message : "Failed to load golden apples",
      status,
      "GOLDEN_APPLES"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-payouts-golden-apples",
    60,
    60_000
  )
  if (blocked) return blocked

  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = batchGoldenApplesSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = await updateGoldenApplesBatch(parsed.data.updates)
    return apiOk(
      result,
      `Updated Golden Light apples on ${result.updated.length} payout(s)`
    )
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Batch apple update failed",
      500,
      "GOLDEN_APPLES"
    )
  }
}
