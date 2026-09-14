import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiOrigin } from "@/lib/api-guard"
import { restoreOpsBackup } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 600

export async function POST(request: Request) {
  const blocked = await guardApiOrigin()
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let name = ""
  let confirm = false
  let restoreEnv = false
  try {
    const body = (await request.json()) as {
      name?: string
      confirm?: boolean
      restoreEnv?: boolean
    }
    name = body.name?.trim() || ""
    confirm = body.confirm === true
    restoreEnv = body.restoreEnv === true
  } catch {
    /* empty */
  }
  if (!confirm) {
    return apiFail(
      'Body must include {"confirm": true} — this replaces live data/',
      400,
      "CONFIRM_REQUIRED"
    )
  }
  if (!name) {
    return apiFail("Missing archive name", 400, "VALIDATION")
  }

  try {
    const result = await restoreOpsBackup(session.username, {
      name,
      confirm: true,
      restoreEnv,
    })
    if (!result.ok) {
      return apiFail(
        result.detail || result.error || "Restore failed to start",
        result.error === "busy" ? 409 : 502,
        "OPS"
      )
    }
    return apiOk(result, result.message || "Restore started")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Restore failed to start",
      502,
      "OPS"
    )
  }
}
