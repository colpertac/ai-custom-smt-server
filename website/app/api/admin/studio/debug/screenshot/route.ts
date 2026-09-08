import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  DebugSnapError,
  requestRemoteDebugScreenshot,
} from "@/lib/studio-debug-remote"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  role: z.enum(["vam1", "vaf1", "vam", "vaf"]),
  step: z.string().max(48).optional(),
})

/** Ask the Wine-host preview agent for a full-window debug snap. */
export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-studio-debug-snap",
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
    const meta = await requestRemoteDebugScreenshot(parsed.data)
    return apiOk({ screenshot: meta }, "Debug screenshot captured")
  } catch (e) {
    if (e instanceof DebugSnapError) {
      return apiFail(e.message, e.status, "DEBUG_SNAP")
    }
    return apiFail(
      e instanceof Error ? e.message : "Debug snap failed",
      502,
      "DEBUG_SNAP"
    )
  }
}
