import { apiFail } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { fetchOpsBackupArchive } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 1800

const NAME_RE = /^smt-runtime-\d{8}-\d{6}\.tar\.gz$/

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { name: raw } = await context.params
  const name = decodeURIComponent(raw || "").trim()
  if (!NAME_RE.test(name)) {
    return apiFail("Invalid archive name", 400, "VALIDATION")
  }

  try {
    const upstream = await fetchOpsBackupArchive(name, session.username)
    if (upstream.status === 401) {
      return apiFail("Ops token rejected by sidecar", 502, "OPS")
    }
    if (upstream.status === 404) {
      return apiFail("Archive not found", 404, "NOT_FOUND")
    }
    if (!upstream.ok) {
      return apiFail(`Download failed (HTTP ${upstream.status})`, 502, "OPS")
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
        ...(upstream.headers.get("Content-Length")
          ? { "Content-Length": upstream.headers.get("Content-Length")! }
          : {}),
      },
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Download failed",
      502,
      "OPS"
    )
  }
}
