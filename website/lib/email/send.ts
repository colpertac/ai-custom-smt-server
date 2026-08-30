import { Resend } from "resend"

import { getEffectiveResendApiKey } from "@/lib/email-settings-store"
import { getEmailBranding } from "@/lib/email/branding"

let client: Resend | null = null
let cachedKey: string | null = null

function getClient(): Resend | null {
  const key = getEffectiveResendApiKey()
  if (!key) return null
  if (client && cachedKey === key) return client
  cachedKey = key
  client = new Resend(key)
  return client
}

export type SendEmailInput = {
  to: string
  subject: string
  html: string
}

/**
 * Send via Resend. No-ops (logs) when RESEND_API_KEY is unset so local
 * register/reset still works without mail.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id?: string; skipped?: boolean }> {
  const resend = getClient()
  const branding = getEmailBranding()

  if (!resend) {
    console.warn(
      `[email] skip send to ${input.to} (RESEND_API_KEY not set): ${input.subject}`
    )
    return { skipped: true }
  }

  const response = await resend.emails.send({
    from: `${branding.fromName} <${branding.fromEmail}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
  })

  if (response.error) {
    throw new Error(response.error.message)
  }

  return { id: response.data?.id }
}
