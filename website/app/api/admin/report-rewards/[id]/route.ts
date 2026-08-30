import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { putReportRewardDungeonSchema } from "@/lib/report-reward-schema"
import {
  readReportRewardDungeon,
  ReportRewardNotFoundError,
  writeReportRewardDungeon,
} from "@/lib/report-rewards-fs"
import { requireWebSession } from "@/lib/web-session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { id } = await params
  try {
    const file = await readReportRewardDungeon(id)
    return apiOk(file)
  } catch (error) {
    if (error instanceof ReportRewardNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to read dungeon",
      500,
      "REPORT_REWARDS"
    )
  }
}

export async function PUT(request: Request, { params }: Params) {
  const blocked = await guardApiMutation("admin-report-rewards-dungeon", 60, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = putReportRewardDungeonSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }
  if (parsed.data.dungeon.id !== id) {
    return apiFail("Dungeon id mismatch", 400, "VALIDATION")
  }

  try {
    await writeReportRewardDungeon(parsed.data)
    return apiOk({ id }, "Saved")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to save dungeon",
      500,
      "REPORT_REWARDS"
    )
  }
}
