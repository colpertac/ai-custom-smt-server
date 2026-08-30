import { adminGetAccounts } from "@/lib/comp-api"
import { apiFail, apiOk } from "@/lib/api-response"
import { displayEmail } from "@/lib/email"
import { isAdminLevel } from "@/lib/admin-level"
import { persistWebSession, requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const accounts = await adminGetAccounts(session)
    await persistWebSession(session)
    return apiOk(
      accounts.map((a) => ({
        ...a,
        email: displayEmail(a.email, a.username),
      }))
    )
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list accounts",
      502,
      "COMP"
    )
  }
}
