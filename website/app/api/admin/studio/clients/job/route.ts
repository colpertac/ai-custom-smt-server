import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  StudioAgentError,
  fetchOrchJob,
} from "@/lib/studio-agent-remote"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const job = await fetchOrchJob()
    return apiOk({ job })
  } catch (e) {
    if (e instanceof StudioAgentError) {
      return apiFail(e.message, e.status, "STUDIO_AGENT")
    }
    return apiFail(
      e instanceof Error ? e.message : "Job poll failed",
      502,
      "STUDIO_AGENT"
    )
  }
}
