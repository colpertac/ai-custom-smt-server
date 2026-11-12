import { apiFail, apiOk } from "@/lib/api-response"
import { claimRenderWorkerJob, type PortraitJob } from "@/lib/portrait-queue"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"

export const dynamic = "force-dynamic"

/** Optional JSON body; null when empty or not a JSON object. */
async function readClaimBody(
  request: Request
): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text()
    if (!text.trim()) return null
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function jobResponse(job: PortraitJob) {
  const payload = job.payload
  return {
    fingerprint: job.fingerprint,
    characterName: job.characterName,
    status: job.status,
    canonical: payload.canonical,
    payload,
    claimedAt: job.claimedAt,
    recipe: payload.recipe,
    preset: payload.preset,
    width: payload.width,
    height: payload.height,
    rendererVersion: payload.rendererVersion,
    catalogVersion: payload.catalogVersion,
  }
}

/**
 * Claim the next pending portrait job (or return empty) for the render worker
 * (avatar/docs/WORKER.md). Auth: X-Portrait-Worker-Token
 *
 * Body `{kind: "three", rendererVersion?, workerId?}`; anything else is a 400. `empty` +
 * `versionMismatch` when the worker's rendererVersion differs from the site's.
 */
export async function POST(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  const body = await readClaimBody(request)
  if (body?.kind !== "three") {
    return apiFail(
      'Claim body must be JSON {"kind": "three", ...} (render worker only)',
      400,
      "VALIDATION"
    )
  }

  try {
    const result = claimRenderWorkerJob(body)
    if (result.versionMismatch) {
      return apiOk(
        {
          empty: true as const,
          job: null,
          versionMismatch: true as const,
          note: result.note,
          siteRendererVersion: result.siteRendererVersion,
          workerRendererVersion: result.workerRendererVersion,
        },
        result.note
      )
    }
    if (!result.job) {
      return apiOk({ empty: true as const, job: null })
    }
    return apiOk({ empty: false as const, job: jobResponse(result.job) })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Claim failed",
      500,
      "QUEUE"
    )
  }
}
