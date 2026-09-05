import {
  AdminSqlError,
  runAdminSql,
  WorldDbMissingError,
} from "@/lib/admin-sql"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { requireWebSession } from "@/lib/web-session"
import { z } from "zod"

const bodySchema = z.object({
  sql: z.string().min(1).max(10_000),
})

/** POST /api/admin/sql — run a read-only SELECT against world SQLite. */
export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-sql", 30, 60_000)
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
    const result = runAdminSql(parsed.data.sql)
    return apiOk(result)
  } catch (error) {
    if (error instanceof WorldDbMissingError) {
      return apiFail(error.message, 503, "DB")
    }
    if (error instanceof AdminSqlError) {
      return apiFail(error.message, 400, "SQL")
    }
    return apiFail(
      error instanceof Error ? error.message : "Query failed",
      500,
      "ADMIN"
    )
  }
}
