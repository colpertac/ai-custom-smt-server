import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { batchPayoutCpSchema } from "@/lib/dungeon-payout-schema"
import { updatePayoutCpBatch } from "@/lib/dungeon-payouts-fs"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-payouts-batch-cp", 60, 60_000)
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

  const parsed = batchPayoutCpSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = await updatePayoutCpBatch(parsed.data.updates)
    return apiOk(
      result,
      `Updated CP on ${result.updated.length} payout(s)`
    )
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Batch CP update failed",
      500,
      "PAYOUTS"
    )
  }
}
