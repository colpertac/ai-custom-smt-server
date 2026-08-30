import { apiFail, apiOk } from "@/lib/api-response"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"
import { claimPortraitJob } from "@/lib/portrait-queue"

export const dynamic = "force-dynamic"

/**
 * Claim the next pending portrait job (or return empty).
 * Auth: X-Portrait-Worker-Token
 */
export async function POST(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  try {
    const job = claimPortraitJob()
    if (!job) {
      return apiOk({ empty: true as const, job: null })
    }
    const gender = job.payload.appearance?.gender ?? 0
    return apiOk({
      empty: false as const,
      job: {
        fingerprint: job.fingerprint,
        characterName: job.characterName,
        status: job.status,
        canonical: job.payload.canonical,
        gender,
        /** 0 → vam1, 1 → vaf1 (worker may override via env). */
        mannequinHint: gender === 1 ? "vaf1" : "vam1",
        payload: job.payload,
        claimedAt: job.claimedAt,
      },
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Claim failed",
      500,
      "QUEUE"
    )
  }
}
