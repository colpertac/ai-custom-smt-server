import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiOrigin } from "@/lib/api-guard"
import {
  getOpsBackupRemote,
  putOpsBackupRemote,
  testOpsBackupRemote,
} from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }
  try {
    const result = await getOpsBackupRemote(session.username)
    if (!result.ok) {
      return apiFail(result.detail || result.error || "Remote settings failed", 502, "OPS")
    }
    return apiOk(result)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Remote settings failed",
      502,
      "OPS"
    )
  }
}

export async function PUT(request: Request) {
  const blocked = await guardApiOrigin()
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  try {
    const result = await putOpsBackupRemote(session.username, body)
    if (!result.ok) {
      return apiFail(result.detail || result.error || "Save failed", 502, "OPS")
    }
    return apiOk(result, result.message || "Saved")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Save failed",
      502,
      "OPS"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiOrigin()
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  // Optional: save then test if body present
  try {
    const text = await request.text()
    if (text.trim()) {
      const body = JSON.parse(text) as Record<string, unknown>
      if (Object.keys(body).length) {
        await putOpsBackupRemote(session.username, body)
      }
    }
  } catch {
    /* ignore — test with existing settings */
  }

  try {
    const result = await testOpsBackupRemote(session.username)
    if (!result.ok) {
      return apiFail(result.detail || result.error || "rclone test failed", 502, "OPS")
    }
    return apiOk(result, result.message || "Remote OK")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "rclone test failed",
      502,
      "OPS"
    )
  }
}
