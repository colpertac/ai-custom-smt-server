import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  DEFAULT_STUDIO_LOGIN_TUNABLES,
  getStudioLoginTunables,
  setStudioLoginTunables,
} from "@/lib/studio-login-tunables"
import { requireWebSession } from "@/lib/web-session"

const putSchema = z.object({
  splashEscCount: z.number().optional(),
  splashEscGapSec: z.number().optional(),
  splashSettleSec: z.number().optional(),
  afterEnterSec: z.number().optional(),
  startXFrac: z.number().optional(),
  startYFrac: z.number().optional(),
  startClickCount: z.number().optional(),
  startClickGapSec: z.number().optional(),
  startClickJitterPx: z.number().optional(),
  afterLaunchSec: z.number().optional(),
  onlineTimeoutSec: z.number().optional(),
  loginRetries: z.number().optional(),
  charSelectSec: z.number().optional(),
  debugScreenshots: z.boolean().optional(),
})

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }
  return apiOk({
    tunables: getStudioLoginTunables(),
    defaults: DEFAULT_STUDIO_LOGIN_TUNABLES,
  })
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation(
    "admin-studio-login-tunables",
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
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const tunables = setStudioLoginTunables(parsed.data)
  return apiOk({ tunables }, "Login tunables saved")
}
