import { apiFail, apiOk } from "@/lib/api-response"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"
import {
  claimPortraitJob,
  claimRenderWorkerJob,
  isThreePortraitPayload,
  type PortraitJob,
} from "@/lib/portrait-queue"

export const dynamic = "force-dynamic"

/** Optional JSON body; anything but `{kind: "three", …}` is a Wine studio claim. */
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
  const base = {
    fingerprint: job.fingerprint,
    characterName: job.characterName,
    status: job.status,
    canonical: payload.canonical,
    payload,
    claimedAt: job.claimedAt,
  }
  if (isThreePortraitPayload(payload)) {
    return {
      ...base,
      recipe: payload.recipe,
      preset: payload.preset,
      width: payload.width,
      height: payload.height,
      rendererVersion: payload.rendererVersion,
      catalogVersion: payload.catalogVersion,
    }
  }
  const gender = payload.appearance?.gender ?? 0
  return {
    ...base,
    gender,
    /** 0 → vam1, 1 → vaf1 (worker may override via env). */
    mannequinHint: gender === 1 ? "vaf1" : "vam1",
  }
}

/**
 * Claim the next pending portrait job (or return empty).
 * Auth: X-Portrait-Worker-Token
 *
 * No body (Wine studio worker): jobs without a recipe, as before.
 * `{kind: "three", rendererVersion?, workerId?}` (render worker, avatar/docs/WORKER.md): only
 * recipe jobs; `empty` + `versionMismatch` when the worker's rendererVersion differs.
 */
export async function POST(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  const body = await readClaimBody(request)

  try {
    if (body?.kind === "three") {
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
    }

    const job = claimPortraitJob()
    if (!job) {
      return apiOk({ empty: true as const, job: null })
    }
    return apiOk({ empty: false as const, job: jobResponse(job) })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Claim failed",
      500,
      "QUEUE"
    )
  }
}
