import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { validateLaneAOps } from "@/lib/lane-a-ops"
import { requireWebSession } from "@/lib/web-session"

function failMessage(result: {
  detail?: string
  error?: string
  errors?: string[]
}): string {
  if (result.error === "not_allowed") {
    return "Ops sidecar missing Lane A validate verb. Restart pnpm run ops-sidecar."
  }
  if (result.errors?.length) return result.errors.join("; ")
  return result.detail || result.error || "Lane A validation failed"
}

export async function POST() {
  const blocked = await guardApiMutation(
    "admin-ops-publish-lane-a-validate",
    5,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const result = await validateLaneAOps(session.username)
    if (!result.ok) {
      return apiFail(failMessage(result), 502, "OPS")
    }
    const parts = [
      result.message || "Lane A validation passed",
      result.releaseId ? `release ${result.releaseId}` : null,
      result.shopsCopied != null ? `${result.shopsCopied} shop(s)` : null,
      result.payoutsPackaged != null
        ? `${result.payoutsPackaged} payout(s)`
        : null,
      result.reportRewardsPackaged != null
        ? `${result.reportRewardsPackaged} report-reward pack(s)`
        : null,
    ].filter(Boolean)
    return apiOk(result, parts.join(" — "))
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Lane A validation failed",
      502,
      "OPS"
    )
  }
}
