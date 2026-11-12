import { getRenderWorkerStatus } from "@/lib/admin-portrait-queue"
import { isAdminLevel } from "@/lib/admin-level"
import { apiFail, apiOk } from "@/lib/api-response"
import { requireWebSession } from "@/lib/web-session"

export const dynamic = "force-dynamic"

/** Render worker heartbeats + queue counts for Admin → Portraits. */
export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }
  try {
    return apiOk(getRenderWorkerStatus())
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Render worker status failed",
      502,
      "PORTRAIT_QUEUE"
    )
  }
}
