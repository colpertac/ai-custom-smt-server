import { resetAccountPassword } from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { resetPasswordSchema } from "@/features/auth/schemas/resetPassword.schema"
import { consumePasswordResetToken } from "@/lib/password-reset-store"
import { clearSession } from "@/lib/session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("reset-password", 5, 60_000)
  if (blocked) return blocked

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = resetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const consumed = consumePasswordResetToken(parsed.data.token)
  if (!consumed) {
    return apiFail(
      "This reset link is invalid or has expired.",
      400,
      "RESET_TOKEN"
    )
  }

  try {
    const result = await resetAccountPassword(
      consumed.username,
      parsed.data.password
    )
    if (result.error !== "Success") {
      return apiFail(result.error, 400, "RESET")
    }
    await clearSession()
    return apiOk(null, "Password updated")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Password reset failed",
      502,
      "COMP"
    )
  }
}
