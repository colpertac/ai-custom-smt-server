import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import {
  listPayoutLiveConflicts,
  retirePackagesBlockingLaneA,
} from "@/lib/lane-a-publish"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const conflicts = await listPayoutLiveConflicts()
    return apiOk({ conflicts })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list payout conflicts",
      500,
      "PAYOUT_CONFLICTS"
    )
  }
}

/** Retire live packages that block enabled Lane A payouts (DropSet/event IDs). */
export async function POST() {
  const blocked = await guardApiMutation(
    "admin-payouts-retire-conflicts",
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
    const result = await retirePackagesBlockingLaneA()
    const conflicts = await listPayoutLiveConflicts()
    return apiOk(
      { ...result, conflicts },
      result.retired.length
        ? `Retired ${result.retired.length} package(s): ${result.retired.join(", ")}`
        : "No blocking packages to retire"
    )
  } catch (error) {
    return apiFail(
      error instanceof Error
        ? error.message
        : "Failed to retire conflicting packages",
      500,
      "PAYOUT_CONFLICTS"
    )
  }
}
