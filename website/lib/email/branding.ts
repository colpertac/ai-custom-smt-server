import {
  getEffectiveCompResetSecret,
  getEffectivePublicSiteUrl,
  getEffectiveResendApiKey,
  getEffectiveResendFrom,
  getEffectiveSupportEmail,
} from "@/lib/email-settings-store"

export type EmailBranding = {
  fromName: string
  fromEmail: string
  supportEmail: string
  appUrl: string
  appName: string
}

export function getEmailBranding(): EmailBranding {
  const from = getEffectiveResendFrom()
  const fromEmail = from?.email || "noreply@localhost"
  const fromName = from?.name || "SMT"
  return {
    fromName,
    fromEmail,
    supportEmail: getEffectiveSupportEmail() || fromEmail,
    appUrl: getEffectivePublicSiteUrl() || "http://localhost:3500",
    appName: fromName,
  }
}
