import {
  authenticate,
  authenticatedRequest,
  parseAccountDetails,
} from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isDefaultAdminCredentials, SKIP_DEFAULT_ADMIN_PASSWORD_PROMPT_KEY } from "@/lib/default-admin"
import { loginSchema } from "@/features/auth/schemas/login.schema"
import {
  classifyLoginError,
  isCompUnreachable,
  LOBBY_DOWN_LOGIN_MESSAGE,
} from "@/lib/login-errors"
import { verifyLobbyAdminPassword } from "@/lib/lobby-db"
import { sealSession } from "@/lib/session"
import { getSiteSetting } from "@/lib/site-settings-store"

/** Placeholder challenge for offlineOps sessions (COMP unused until re-login). */
const OFFLINE_OPS_CHALLENGE = "offline"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("login", 10, 60_000)
  if (blocked) return blocked

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    const auth = await authenticate(parsed.data.username, parsed.data.password)
    const detailsRaw = await authenticatedRequest(auth, "/account/get_details")
    const details = parseAccountDetails(detailsRaw)
    const mustChangePassword =
      isDefaultAdminCredentials(parsed.data.username, parsed.data.password) &&
      getSiteSetting(SKIP_DEFAULT_ADMIN_PASSWORD_PROMPT_KEY) !== "1"

    await sealSession({
      ...auth,
      dispName: details.dispName,
      userLevel: details.userLevel,
      mustChangePassword,
    })

    return apiOk({
      username: details.username,
      dispName: details.dispName,
      userLevel: details.userLevel,
      email: details.email,
      cp: details.cp,
      mustChangePassword,
    })
  } catch (error) {
    if (isCompUnreachable(error)) {
      const offline = verifyLobbyAdminPassword(
        parsed.data.username,
        parsed.data.password
      )
      if (offline.ok) {
        const mustChangePassword =
          isDefaultAdminCredentials(
            parsed.data.username,
            parsed.data.password
          ) && getSiteSetting(SKIP_DEFAULT_ADMIN_PASSWORD_PROMPT_KEY) !== "1"

        await sealSession({
          username: offline.username,
          passwordHash: offline.passwordHash,
          challenge: OFFLINE_OPS_CHALLENGE,
          dispName: offline.dispName,
          userLevel: offline.userLevel,
          mustChangePassword,
          offlineOps: true,
        })

        return apiOk({
          username: offline.username,
          dispName: offline.dispName,
          userLevel: offline.userLevel,
          mustChangePassword,
          offlineOps: true,
        })
      }

      return apiFail(LOBBY_DOWN_LOGIN_MESSAGE, 502, "COMP")
    }

    const fail = classifyLoginError(error)
    return apiFail(fail.message, fail.statusCode, fail.error)
  }
}
