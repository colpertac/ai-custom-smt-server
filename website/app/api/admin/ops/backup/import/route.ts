import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiOrigin } from "@/lib/api-guard"
import { importOpsBackupArchive } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 1800

const NAME_RE = /^smt-runtime-\d{8}-\d{6}\.tar\.gz$/

export async function POST(request: Request) {
  const blocked = await guardApiOrigin()
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const name =
    new URL(request.url).searchParams.get("name")?.trim() ||
    request.headers.get("x-archive-name")?.trim() ||
    ""
  if (!NAME_RE.test(name)) {
    return apiFail(
      "Query name= must be smt-runtime-YYYYMMDD-HHMMSS.tar.gz",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = await importOpsBackupArchive(session.username, {
      name,
      body: request.body,
      contentLength: request.headers.get("content-length"),
    })
    if (!result.ok) {
      return apiFail(result.error || "Import failed", 502, "OPS")
    }
    return apiOk(result, result.message || "Imported")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Import failed",
      502,
      "OPS"
    )
  }
}
