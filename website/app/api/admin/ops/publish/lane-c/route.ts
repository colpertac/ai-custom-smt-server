import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { publishOpsLaneC } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  // Pull can take several minutes
  const blocked = await guardApiMutation("admin-ops-publish-lane-c", 2, 600_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let includeWebsite = false
  let confirm = false
  try {
    const body = (await request.json()) as {
      confirm?: boolean
      includeWebsite?: boolean
      website?: boolean
    }
    confirm = body.confirm === true
    includeWebsite = Boolean(body.includeWebsite || body.website)
  } catch {
    /* empty */
  }
  if (!confirm) {
    return apiFail(
      'Body must include {"confirm": true} — Lane C recreates game containers',
      400,
      "CONFIRM_REQUIRED"
    )
  }

  try {
    const result = await publishOpsLaneC(session.username, {
      confirm: true,
      includeWebsite,
    })
    if (!result.ok) {
      const msg =
        result.error === "not_allowed"
          ? "Ops sidecar missing /publish/lane-c. Restart pnpm run ops-sidecar."
          : result.error === "lane_c_docker_only"
            ? result.message ||
              "Lane C requires OPS_BACKEND=docker (not available on native/dev)."
            : result.detail ||
              result.message ||
              result.error ||
              "Lane C pull/recreate failed"
      const status =
        result.error === "lane_c_docker_only" ||
        result.error === "confirm_required"
          ? 400
          : 502
      return apiFail(msg, status, "OPS")
    }
    return apiOk(result, result.message || "Lane C applied")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Lane C pull/recreate failed",
      502,
      "OPS"
    )
  }
}
