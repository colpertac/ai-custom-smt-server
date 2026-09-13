import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { apiFail, apiOk } from "@/lib/api-response"
import { FEEDBACK_STATUSES } from "@/lib/feedback-constants"
import { listFeedback } from "@/lib/feedback-store"
import { requireWebSession } from "@/lib/web-session"

const listQuery = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
})

export async function GET(request: Request) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const url = new URL(request.url)
  const parsed = listQuery.safeParse({
    status: url.searchParams.get("status") ?? undefined,
  })
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const status = parsed.data.status ?? "open"
  return apiOk({ items: listFeedback(status) })
}
