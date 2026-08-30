import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { startOpsServers } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

/** Compose start waits on healthchecks — allow long-running request. */
export const maxDuration = 300

export async function POST() {
  const blocked = await guardApiMutation("admin-ops-start", 3, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const result = await startOpsServers(session.username)
    if (!result.ok) {
      const msg = result.detail || result.error || "Start failed"
      const status = result.error === "first_boot_incomplete" ? 409 : 502
      const code =
        result.error === "first_boot_incomplete" ? "FIRST_BOOT" : "OPS"
      return apiFail(msg, status, code)
    }
    return apiOk(result, result.message || "Game servers started")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Start failed",
      502,
      "OPS"
    )
  }
}
