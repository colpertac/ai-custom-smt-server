import {
  authenticatedRequest,
  CompApiError,
  parseAccountDetails,
} from "@/lib/comp-api"
import { apiFail, apiOk } from "@/lib/api-response"
import { displayEmail } from "@/lib/email"
import { clearSession, readSession } from "@/lib/session"
import {
  CompSessionMissingError,
  withCompSession,
} from "@/lib/web-session"

/** Cookie-only identity for the header (no lobby round-trip). */
function sessionFromCookie() {
  return readSession().then((session) => {
    if (!session) return null
    return {
      username: session.username,
      dispName: session.dispName ?? session.username,
      userLevel: session.userLevel ?? 0,
    }
  })
}

export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1"

  if (!fresh) {
    return apiOk(await sessionFromCookie())
  }

  try {
    return await withCompSession(async (session) => {
      const raw = await authenticatedRequest(session, "/account/get_details")
      const details = parseAccountDetails(raw)
      session.dispName = details.dispName
      session.userLevel = details.userLevel
      return apiOk({
        username: details.username,
        dispName: details.dispName,
        userLevel: details.userLevel,
        email: displayEmail(details.email, details.username),
        cp: details.cp,
        ticketCount: details.ticketCount,
        characterCount: details.characterCount,
        enabled: details.enabled,
        lastLogin: details.lastLogin,
        banReason: details.banReason,
        banInitiator: details.banInitiator,
      })
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiOk(null)
    }
    if (error instanceof CompApiError && error.status === 401) {
      await clearSession()
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }

    const cached = await sessionFromCookie()
    if (cached) return apiOk(cached)

    return apiFail(
      error instanceof Error ? error.message : "Session check failed",
      502,
      "COMP"
    )
  }
}
