import { apiFail, apiOk } from "@/lib/api-response"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"
import { failPortraitJob } from "@/lib/portrait-queue"

export const dynamic = "force-dynamic"

/**
 * Mark a claimed job failed.
 * Body JSON: { fingerprint, error? }
 */
export async function POST(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  let body: { fingerprint?: string; error?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return apiFail("Expected JSON body", 400, "VALIDATION")
  }

  const fingerprint = body.fingerprint?.trim() ?? ""
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) {
    return apiFail("Invalid fingerprint", 400, "VALIDATION")
  }
  const reason = (body.error?.trim() || "failed").slice(0, 500)

  try {
    const job = failPortraitJob(fingerprint, reason)
    return apiOk(
      {
        fingerprint: job.fingerprint,
        status: job.status,
        error: job.error,
      },
      `Failed ${job.fingerprint}`
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Fail failed"
    const status = /unknown portrait job/i.test(msg) ? 404 : 500
    return apiFail(msg, status, "QUEUE")
  }
}
