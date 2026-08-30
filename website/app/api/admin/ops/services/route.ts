import { z } from "zod"

import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import {
  restartOpsServices,
  startOpsServices,
  stopOpsServices,
} from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
  service: z.enum(["lobby", "world", "channel"]),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-ops-service-control", 12, 60_000)
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

  const { action, service } = parsed.data
  const label = service.charAt(0).toUpperCase() + service.slice(1)

  try {
    const result =
      action === "start"
        ? await startOpsServices([service], session.username)
        : action === "stop"
          ? await stopOpsServices([service], session.username)
          : await restartOpsServices([service], session.username)

    if (!result.ok) {
      const msg =
        result.message ||
        result.detail ||
        result.error ||
        `${label} ${action} failed`
      const status =
        result.error === "first_boot_incomplete" ||
        result.error === "dependency"
          ? 409
          : 502
      return apiFail(msg, status, "OPS")
    }

    const past =
      action === "start" ? "started" : action === "stop" ? "stopped" : "restarted"
    return apiOk(result, result.message || `${label} ${past}`)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : `${label} ${action} failed`,
      502,
      "OPS"
    )
  }
}
