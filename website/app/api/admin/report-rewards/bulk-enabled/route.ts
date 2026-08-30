import { z } from "zod"

import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { setAllReportRewardEnabled } from "@/lib/report-rewards-fs"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  enabled: z.boolean(),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-report-rewards-bulk-enabled",
    10,
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
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "enabled boolean required",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = await setAllReportRewardEnabled(parsed.data.enabled)
    return apiOk(
      result,
      parsed.data.enabled
        ? `Turned live on for ${result.updated} dungeon(s)`
        : `Turned live off for ${result.updated} dungeon(s)`
    )
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Bulk update failed",
      500,
      "REPORT_REWARDS"
    )
  }
}
