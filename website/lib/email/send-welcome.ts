import { welcomeEmailTemplate } from "@/email-templates"
import { getEmailBranding } from "@/lib/email/branding"
import { sendEmail } from "@/lib/email/send"

export async function sendWelcomeEmail(input: {
  to: string
  userName: string
}): Promise<void> {
  const branding = getEmailBranding()
  const html = welcomeEmailTemplate({
    userName: input.userName,
    accountUrl: `${branding.appUrl}/account`,
    downloadUrl: `${branding.appUrl}/download`,
  })

  await sendEmail({
    to: input.to,
    subject: `Welcome to ${branding.appName}`,
    html,
  })
}
