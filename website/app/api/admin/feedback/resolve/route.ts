import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { FEEDBACK_STATUSES } from "@/lib/feedback-constants"
import { setFeedbackStatus } from "@/lib/feedback-store"
import { requireWebSession } from "@/lib/web-session"

const resolveSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(FEEDBACK_STATUSES),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-feedback-resolve", 30, 60_000)
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

  const parsed = resolveSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const item = setFeedbackStatus(parsed.data.id, parsed.data.status)
  if (!item) return apiFail("Not found", 404, "NOT_FOUND")
  return apiOk({ item }, parsed.data.status === "closed" ? "Marked done" : "Reopened")
}
