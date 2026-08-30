import { changePassword, CompApiError } from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { changePasswordSchema } from "@/features/auth/schemas/changePassword.schema"
import { clearSession } from "@/lib/session"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("password", 5, 60_000)
  if (blocked) return blocked

  const gate = await requireWebSession()
  if (!gate) {
    return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    return await withCompSession(async (session) => {
      const result = await changePassword(session, parsed.data.password)
      if (result.error !== "Success") {
        return apiFail(result.error, 400, "PASSWORD")
      }
      await clearSession()
      return apiOk(null, "Password changed")
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    if (error instanceof CompApiError) {
      return apiFail(error.message, error.status, "COMP")
    }
    return apiFail(
      error instanceof Error ? error.message : "Password change failed",
      502,
      "COMP"
    )
  }
}
