import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiOrigin } from "@/lib/api-guard"
import { syncOpsBackup } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180

export async function POST(request: Request) {
  const blocked = await guardApiOrigin()
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let name: string | undefined
  try {
    const body = (await request.json()) as { name?: string }
    name = body.name?.trim() || undefined
  } catch {
    /* empty */
  }

  try {
    const result = await syncOpsBackup(session.username, { name })
    if (!result.ok) {
      const status =
        result.error === "busy"
          ? 409
          : result.error === "no_archives" ||
              result.error === "rclone_missing" ||
              result.error === "remote_missing"
            ? 400
            : 502
      return apiFail(
        result.detail || result.error || "Sync failed to start",
        status,
        "OPS"
      )
    }
    return apiOk(result, result.message || "rclone sync started")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Sync failed to start",
      502,
      "OPS"
    )
  }
}
