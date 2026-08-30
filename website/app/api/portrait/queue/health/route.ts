import { apiFail, apiOk } from "@/lib/api-response"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"
import { listPortraitJobs } from "@/lib/portrait-queue"

export const dynamic = "force-dynamic"

/** Worker probe: auth + queue depth. */
export async function GET(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

  try {
    const jobs = listPortraitJobs()
    const byStatus = {
      pending: jobs.filter((j) => j.status === "pending").length,
      claimed: jobs.filter((j) => j.status === "claimed").length,
      ready: jobs.filter((j) => j.status === "ready").length,
      failed: jobs.filter((j) => j.status === "failed").length,
    }
    return apiOk({
      ok: true,
      queue: byStatus,
      total: jobs.length,
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Queue health failed",
      500,
      "QUEUE"
    )
  }
}
