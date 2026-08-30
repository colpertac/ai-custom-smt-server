import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { publishOpsLaneB } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export async function POST() {
  const blocked = await guardApiMutation("admin-ops-publish-lane-b", 3, 120_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const result = await publishOpsLaneB(session.username)
    if (!result.ok) {
      const msg =
        result.error === "not_allowed"
          ? "Ops sidecar missing /publish/lane-b. Restart pnpm run ops-sidecar."
          : result.detail || result.error || "Lane B rehash failed"
      return apiFail(msg, 502, "OPS")
    }
    return apiOk(result, result.message || "Overlay rehashed")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Lane B rehash failed",
      502,
      "OPS"
    )
  }
}
