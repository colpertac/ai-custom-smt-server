import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { validateOpsLaneAConfig } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-ops-publish-lane-a-config-validate",
    10,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let only: string[] | undefined
  try {
    const body = (await request.json()) as { only?: string[] }
    if (Array.isArray(body.only)) only = body.only.map(String)
  } catch {
    /* empty */
  }

  try {
    const result = await validateOpsLaneAConfig(session.username, { only })
    if (!result.ok) {
      const msg =
        result.error === "not_allowed"
          ? "Ops sidecar missing Lane A config validate verb. Restart pnpm run ops-sidecar."
          : result.detail ||
            result.error ||
            result.errors?.join("; ") ||
            "Config validation failed"
      return apiFail(msg, 502, "OPS")
    }
    return apiOk(result, result.message || "Config validation passed")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Config validation failed",
      502,
      "OPS"
    )
  }
}
