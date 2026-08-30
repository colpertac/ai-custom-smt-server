import { getResendFrom, getSiteUrl } from "@/lib/env"

export type EmailBranding = {
  fromName: string
  fromEmail: string
  supportEmail: string
  appUrl: string
  appName: string
}

export function getEmailBranding(): EmailBranding {
  const from = getResendFrom()
  const fromEmail = from?.email || "noreply@localhost"
  const fromName = from?.name || "SMT"
  return {
    fromName,
    fromEmail,
    supportEmail: process.env.RESEND_SUPPORT_EMAIL?.trim() || fromEmail,
    appUrl: getSiteUrl() || "http://localhost:3500",
    appName: fromName,
  }
}
