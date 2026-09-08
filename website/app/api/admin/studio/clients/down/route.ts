import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  StudioAgentError,
  stopOrchClients,
} from "@/lib/studio-agent-remote"
import { requireWebSession } from "@/lib/web-session"

/** Kill Imagine clients on the Wine host. */
export async function POST() {
  const blocked = await guardApiMutation(
    "admin-studio-clients-down",
    10,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const result = await stopOrchClients()
    return apiOk(result, "Clients stopped")
  } catch (e) {
    if (e instanceof StudioAgentError) {
      return apiFail(e.message, e.status, "STUDIO_AGENT")
    }
    return apiFail(
      e instanceof Error ? e.message : "Orch down failed",
      502,
      "STUDIO_AGENT"
    )
  }
}
