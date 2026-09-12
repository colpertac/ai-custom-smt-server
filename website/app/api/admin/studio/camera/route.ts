import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  StudioAgentError,
  runInitCamera,
} from "@/lib/studio-agent-remote"
import { DebugSnapError, requestRemoteDebugScreenshot } from "@/lib/studio-debug-remote"
import { requireWebSession } from "@/lib/web-session"

export const maxDuration = 90

const bodySchema = z.object({
  role: z.enum(["vam1", "vaf1"]),
  snapAfter: z.boolean().optional(),
})

/** Run Wine-host worker init-camera (in-world pose + Home/PageUp/S). */
export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-studio-camera", 10, 60_000)
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
    const result = await runInitCamera({ role: parsed.data.role })

    let screenshot: Awaited<
      ReturnType<typeof requestRemoteDebugScreenshot>
    > | null = null
    let snapNote = ""
    if (parsed.data.snapAfter !== false) {
      try {
        screenshot = await requestRemoteDebugScreenshot({
          role: parsed.data.role,
          step: "camera",
        })
      } catch {
        screenshot = null
      }
      snapNote = screenshot ? " · snapped" : " · snap failed"
    }

    return apiOk(
      { result, screenshot },
      `Init camera ${parsed.data.role}${snapNote}`
    )
  } catch (e) {
    if (e instanceof StudioAgentError) {
      return apiFail(e.message, e.status, "STUDIO_AGENT")
    }
    if (e instanceof DebugSnapError) {
      return apiFail(e.message, e.status, "DEBUG_SNAP")
    }
    return apiFail(
      e instanceof Error ? e.message : "Init camera failed",
      502,
      "STUDIO_AGENT"
    )
  }
}
