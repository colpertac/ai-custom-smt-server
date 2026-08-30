import { after } from "next/server"

import { fetchRecoveryEmail } from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { forgotPasswordSchema } from "@/features/auth/schemas/forgotPassword.schema"
import { sendResetPasswordEmail } from "@/lib/email/send-reset-password"
import { createPasswordResetToken } from "@/lib/password-reset-store"

const GENERIC =
  "If that account has a recovery email, we sent a reset link."

export async function POST(request: Request) {
  const blocked = await guardApiMutation("forgot-password", 5, 60_000)
  if (blocked) return blocked

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = forgotPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  // Always return the same message (no user enumeration).
  try {
    const recovery = await fetchRecoveryEmail(parsed.data.username)
    if (recovery?.email) {
      const { token } = createPasswordResetToken(recovery.username)
      after(() => {
        void sendResetPasswordEmail({
          to: recovery.email,
          userName: recovery.username,
          token,
        }).catch((err) => {
          console.error("[email] reset send failed:", err)
        })
      })
    }
  } catch (err) {
    console.error("[forgot-password]", err)
  }

  return apiOk(null, GENERIC)
}
