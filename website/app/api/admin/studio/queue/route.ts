import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  StudioAgentError,
  setQueueProcessing,
} from "@/lib/studio-agent-remote"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  enabled: z.boolean(),
})

/** Pause / resume portrait queue claims on the Wine host worker. */
export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-studio-queue",
    30,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
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
    const result = await setQueueProcessing({ enabled: parsed.data.enabled })
    return apiOk(
      result,
      parsed.data.enabled
        ? "Queue processing on — worker will claim jobs"
        : "Queue processing paused — start clients first, then enable"
    )
  } catch (e) {
    if (e instanceof StudioAgentError) {
      return apiFail(e.message, e.status, "STUDIO_AGENT")
    }
    return apiFail(
      e instanceof Error ? e.message : "Queue toggle failed",
      502,
      "STUDIO_AGENT"
    )
  }
}
