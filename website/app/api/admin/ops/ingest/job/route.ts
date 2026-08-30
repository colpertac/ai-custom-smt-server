import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getOpsIngestJob } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const jobId = new URL(request.url).searchParams.get("id")?.trim() || ""
  if (!jobId) return apiFail("Missing job id", 400, "VALIDATION")

  try {
    const job = await getOpsIngestJob(jobId, session.username)
    if (!job.ok && job.error === "unauthorized") {
      return apiFail("Ops token rejected by sidecar", 502, "OPS")
    }
    if (!job.ok && job.error === "unknown_job") {
      return apiFail("Unknown ingest job", 404, "NOT_FOUND")
    }
    return apiOk(job)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Ingest job lookup failed",
      502,
      "OPS"
    )
  }
}
