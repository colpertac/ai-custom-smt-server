import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiOrigin } from "@/lib/api-guard"
import { runOpsBackup } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 600

export async function POST(request: Request) {
  // No BFF rate limit — ops returns 409 busy until the prior job finishes.
  const blocked = await guardApiOrigin()
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let mode: "standard" | "full" = "standard"
  let sync: boolean | undefined
  try {
    const body = (await request.json()) as {
      mode?: string
      sync?: boolean
    }
    if (body.mode === "full") mode = "full"
    if (typeof body.sync === "boolean") sync = body.sync
  } catch {
    /* empty */
  }

  try {
    const result = await runOpsBackup(session.username, { mode, sync })
    if (!result.ok) {
      return apiFail(
        result.detail || result.error || "Backup failed to start",
        result.error === "busy" ? 409 : 502,
        "OPS"
      )
    }
    return apiOk(result, result.message || "Backup started")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Backup failed to start",
      502,
      "OPS"
    )
  }
}
