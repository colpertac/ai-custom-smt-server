import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { putReportRewardGlobalSchema } from "@/lib/report-reward-schema"
import {
  readReportRewardGlobal,
  writeReportRewardGlobal,
} from "@/lib/report-rewards-fs"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const file = await readReportRewardGlobal()
    return apiOk(file)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to read global config",
      500,
      "REPORT_REWARDS"
    )
  }
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-report-rewards-global", 30, 60_000)
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

  const parsed = putReportRewardGlobalSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    await writeReportRewardGlobal(parsed.data)
    return apiOk({ ok: true as const }, "Saved")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to save global config",
      500,
      "REPORT_REWARDS"
    )
  }
}
