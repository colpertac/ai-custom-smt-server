import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiOrigin } from "@/lib/api-guard"
import { deleteOpsBackupArchive } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NAME_RE = /^smt-runtime-\d{8}-\d{6}\.tar\.gz$/

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
  try {
    const body = (await request.json()) as { name?: string; confirm?: boolean }
    name = body.name?.trim() || ""
    confirm = body.confirm === true
  } catch {
    /* empty */
  }
  if (!confirm) {
    return apiFail(
      'Body must include {"confirm": true}',
      400,
      "CONFIRM_REQUIRED"
    )
  }
  if (!NAME_RE.test(name)) {
    return apiFail("Invalid archive name", 400, "VALIDATION")
  }

  try {
    const result = await deleteOpsBackupArchive(session.username, name)
    if (!result.ok) {
      return apiFail(
        result.detail || result.error || "Delete failed",
        result.error === "not_found" ? 404 : 502,
        "OPS"
      )
    }
    return apiOk(result, result.message || "Deleted")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Delete failed",
      502,
      "OPS"
    )
  }
}
