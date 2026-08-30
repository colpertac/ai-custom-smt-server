import { adminGetAccounts } from "@/lib/comp-api"
import { apiFail, apiOk } from "@/lib/api-response"
import { displayEmail } from "@/lib/email"
import { isAdminLevel } from "@/lib/admin-level"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"

export async function GET() {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const accounts = await withCompSession(async (session) =>
      adminGetAccounts(session)
    )
    return apiOk(
      accounts.map((a) => ({
        ...a,
        email: displayEmail(a.email, a.username),
      }))
    )
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to list accounts",
      502,
      "COMP"
    )
  }
}
