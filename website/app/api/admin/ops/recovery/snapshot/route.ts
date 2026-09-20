import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { listRecoverySnapshots, snapshotRecovery } from "@/lib/recovery"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const snapshots = await listRecoverySnapshots()
    return apiOk({ snapshots })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Could not list snapshots",
      502,
      "RECOVERY"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-ops-recovery-snapshot", 10, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let reason = "manual"
  try {
    const body = (await request.json()) as { reason?: string }
    if (body.reason?.trim()) reason = body.reason.trim()
  } catch {
    /* empty */
  }

  try {
    const result = await snapshotRecovery({
      actor: session.username,
      reason,
    })
    if (!result.ok) {
      return apiFail(result.message, 502, "RECOVERY")
    }
    return apiOk(result, result.message)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Snapshot failed",
      502,
      "RECOVERY"
    )
  }
}
