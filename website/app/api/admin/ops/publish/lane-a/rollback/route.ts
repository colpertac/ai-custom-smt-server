import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { rollbackOpsLaneA } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-ops-publish-lane-a-rollback",
    3,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let releaseId: string | undefined
  let restart = true
  try {
    const body = (await request.json()) as {
      releaseId?: string
      restart?: boolean
    }
    releaseId = body.releaseId?.trim() || undefined
    if (body.restart === false) restart = false
  } catch {
    /* defaults */
  }

  try {
    const result = await rollbackOpsLaneA(session.username, {
      releaseId,
      restart,
    })
    if (!result.ok) {
      const msg =
        result.error === "not_allowed"
          ? "Ops sidecar missing Lane A rollback verb. Restart pnpm run ops-sidecar."
          : result.detail ||
            result.error ||
            result.errors?.join("; ") ||
            "Lane A rollback failed"
      return apiFail(msg, 502, "OPS")
    }
    return apiOk(result, result.message || "Lane A rolled back")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Lane A rollback failed",
      502,
      "OPS"
    )
  }
}
