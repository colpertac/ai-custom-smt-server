import {
  authenticatedRequest,
  parseAccountDetails,
} from "@/lib/comp-api"
import { apiFail, apiOk } from "@/lib/api-response"
import { displayEmail } from "@/lib/email"
import { clearSession, readSession, updateSession } from "@/lib/session"

export async function GET() {
  const session = await readSession()
  if (!session) {
    return apiOk(null)
  }

  try {
    const raw = await authenticatedRequest(session, "/account/get_details")
    const details = parseAccountDetails(raw)
    await updateSession({
      ...session,
      dispName: details.dispName,
      userLevel: details.userLevel,
    })
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
  } catch {
    await clearSession()
    return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  }
}
