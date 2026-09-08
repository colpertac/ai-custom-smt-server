import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { batchPayoutWeightsSchema } from "@/lib/dungeon-payout-schema"
import { updatePayoutWeightBatch } from "@/lib/dungeon-payouts-fs"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-payouts-batch-weights",
    60,
    60_000
  )
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

  const parsed = batchPayoutWeightsSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = await updatePayoutWeightBatch(parsed.data.updates)
    return apiOk(
      result,
      `Updated weight on ${result.updated.length} payout(s)`
    )
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Batch weight update failed",
      500,
      "PAYOUTS"
    )
  }
}
