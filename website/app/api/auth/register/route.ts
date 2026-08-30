import { after } from "next/server"

import {
  authenticate,
  authenticatedRequest,
  parseAccountDetails,
  registerAccount,
} from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { registerSchema } from "@/features/auth/schemas/register.schema"
import { isPlaceholderEmail } from "@/lib/email/placeholders"
import { sendWelcomeEmail } from "@/lib/email/send-welcome"
import { classifyRegisterError } from "@/lib/register-errors"
import { sealSession } from "@/lib/session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("register", 5, 60_000)
  if (blocked) return blocked

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = await registerAccount(parsed.data)
    if (result.error !== "Success") {
      return apiFail(result.error, 400, "REGISTER")
    }

    const auth = await authenticate(
      parsed.data.username,
      parsed.data.password
    )
    const detailsRaw = await authenticatedRequest(auth, "/account/get_details")
    const details = parseAccountDetails(detailsRaw)

    await sealSession({
      ...auth,
      dispName: details.dispName,
      userLevel: details.userLevel,
    })

    const realEmail = parsed.data.email.trim()
    if (realEmail && !isPlaceholderEmail(realEmail, details.username)) {
      after(() => {
        void sendWelcomeEmail({
          to: realEmail,
          userName: details.dispName || details.username,
        }).catch((err) => {
          console.error("[email] welcome send failed:", err)
        })
      })
    }

    return apiOk(
      {
        username: details.username,
        dispName: details.dispName,
        userLevel: details.userLevel,
        email: details.email,
        cp: details.cp,
      },
      "Registered"
    )
  } catch (error) {
    const fail = classifyRegisterError(error)
    return apiFail(fail.message, fail.statusCode, fail.error)
  }
}
