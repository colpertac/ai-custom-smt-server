import {
  authenticate,
  authenticatedRequest,
  parseAccountDetails,
} from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isDefaultAdminCredentials, SKIP_DEFAULT_ADMIN_PASSWORD_PROMPT_KEY } from "@/lib/default-admin"
import { loginSchema } from "@/features/auth/schemas/login.schema"
import { classifyLoginError } from "@/lib/login-errors"
import { sealSession } from "@/lib/session"
import { getSiteSetting } from "@/lib/site-settings-store"

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
    const fail = classifyLoginError(error)
    return apiFail(fail.message, fail.statusCode, fail.error)
  }
}
