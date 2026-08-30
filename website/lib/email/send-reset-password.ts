import { resetPasswordTemplate } from "@/email-templates"
import { getEmailBranding } from "@/lib/email/branding"
import { sendEmail } from "@/lib/email/send"

export async function sendResetPasswordEmail(input: {
  to: string
  userName: string
  token: string
  expiresIn?: string
}): Promise<void> {
  const branding = getEmailBranding()
  const resetLink = `${branding.appUrl}/reset-password?token=${encodeURIComponent(input.token)}`
  const expiresIn = input.expiresIn ?? "1 hour"
  const html = resetPasswordTemplate({
    userName: input.userName,
    resetLink,
    expiresIn,
  })

  await sendEmail({
    to: input.to,
    subject: `Reset your ${branding.appName} password`,
    html,
  })
}
