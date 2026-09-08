import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  StudioAgentError,
  clientAction,
} from "@/lib/studio-agent-remote"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  role: z.enum(["vam1", "vaf1"]),
  action: z.enum(["start", "stop", "restart"]),
})

/** Per-role start / stop / restart on the Wine host. */
export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-studio-clients-action",
    20,
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
    const result = await clientAction(parsed.data)
    const status =
      parsed.data.action === "stop"
        ? 200
        : 202
    return apiOk(
      result,
      `${parsed.data.action} ${parsed.data.role}`,
      { status }
    )
  } catch (e) {
    if (e instanceof StudioAgentError) {
      return apiFail(e.message, e.status, "STUDIO_AGENT")
    }
    return apiFail(
      e instanceof Error ? e.message : "Client action failed",
      502,
      "STUDIO_AGENT"
    )
  }
}
