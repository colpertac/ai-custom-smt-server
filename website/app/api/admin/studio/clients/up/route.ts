import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  StudioAgentError,
  startOrchUp,
} from "@/lib/studio-agent-remote"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  maleOnly: z.boolean().optional(),
})

/** Start Imagine clients via Wine-host orch (async job). */
export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-studio-clients-up", 10, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    const job = await startOrchUp({ maleOnly: parsed.data.maleOnly })
    return apiOk({ job }, "Orch up started on Wine host")
  } catch (e) {
    if (e instanceof StudioAgentError) {
      return apiFail(e.message, e.status, "STUDIO_AGENT")
    }
    return apiFail(
      e instanceof Error ? e.message : "Orch up failed",
      502,
      "STUDIO_AGENT"
    )
  }
}
