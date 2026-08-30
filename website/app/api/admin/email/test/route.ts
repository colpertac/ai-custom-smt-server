import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getEffectiveResendApiKey } from "@/lib/email-settings-store"
import { sendEmail } from "@/lib/email/send"
import { requireWebSession } from "@/lib/web-session"

const postSchema = z.object({
  to: z.string().trim().email("Enter a valid email address"),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-email-test", 5, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  if (!getEffectiveResendApiKey()) {
    return apiFail("Resend API key not configured", 400, "NOT_CONFIGURED")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = await sendEmail({
      to: parsed.data.to,
      subject: "Test email from your game portal",
      html: `<p>If you received this, Resend is configured correctly.</p>`,
    })
    if (result.skipped) {
      return apiFail("Email was not sent (Resend not configured)", 400, "SKIP")
    }
    return apiOk({ id: result.id }, "Test email sent")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Send failed",
      502,
      "RESEND"
    )
  }
}
