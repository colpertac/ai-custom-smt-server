import { apiFail, apiOk } from "@/lib/api-response"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"
import { getPortraitJob } from "@/lib/portrait-queue"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ fingerprint: string }> }

/** Look up one job by fingerprint. */
export async function GET(request: Request, { params }: Params) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  const { fingerprint: raw } = await params
  const fingerprint = (raw ?? "").trim().toLowerCase()
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) {
    return apiFail("Invalid fingerprint", 400, "VALIDATION")
  }

  try {
    const job = getPortraitJob(fingerprint)
    if (!job) {
      return apiFail("Job not found", 404, "NOT_FOUND")
    }
    return apiOk({
      fingerprint: job.fingerprint,
      characterName: job.characterName,
      status: job.status,
      error: job.error,
      claimedAt: job.claimedAt,
      updatedAt: job.updatedAt,
      canonical: job.payload.canonical,
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Lookup failed",
      500,
      "QUEUE"
    )
  }
}
