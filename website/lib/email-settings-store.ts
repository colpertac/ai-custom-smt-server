import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { getSiteSetting, setSiteSetting } from "@/lib/site-settings-store"

const KEY_PUBLIC_SITE_URL = "email_public_site_url"
const KEY_RESEND_API_KEY = "resend_api_key"
const KEY_FROM_EMAIL = "resend_from_email"
const KEY_FROM_NAME = "resend_from_name"
const KEY_SUPPORT_EMAIL = "resend_support_email"
const KEY_COMP_RESET_SECRET = "comp_reset_secret"

export type EmailSettings = {
  publicSiteUrl: string
  fromEmail: string
  fromName: string
  supportEmail: string
}

export type EmailSettingsAdminView = EmailSettings & {
  apiKeyConfigured: boolean
  resetSecretConfigured: boolean
  mailConfigured: boolean
}

export type EmailSettingsInput = Partial<
  EmailSettings & {
    apiKey: string
    resetSecret: string
  }
>

function websiteDataDir(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function compResetSecretFilePath(): string {
  return path.join(websiteDataDir(), "comp-reset-secret")
}

let envSeeded = false

function seedFromEnvOnce(): void {
  if (envSeeded) return
  envSeeded = true

  const envKey = process.env.RESEND_API_KEY?.trim()
  const envFrom = process.env.RESEND_FROM_EMAIL?.trim()
  const envName = process.env.RESEND_FROM_NAME?.trim()
  const envSupport = process.env.RESEND_SUPPORT_EMAIL?.trim()
  const envSite = process.env.SITE_URL?.trim()
  const envReset = process.env.COMP_RESET_SECRET?.trim()

  if (envKey && !getSiteSetting(KEY_RESEND_API_KEY)) {
    setSiteSetting(KEY_RESEND_API_KEY, envKey)
  }
  if (envFrom && !getSiteSetting(KEY_FROM_EMAIL)) {
    setSiteSetting(KEY_FROM_EMAIL, envFrom)
  }
  if (envName && !getSiteSetting(KEY_FROM_NAME)) {
    setSiteSetting(KEY_FROM_NAME, envName)
  }
  if (envSupport && !getSiteSetting(KEY_SUPPORT_EMAIL)) {
    setSiteSetting(KEY_SUPPORT_EMAIL, envSupport)
  }
  if (envSite && !getSiteSetting(KEY_PUBLIC_SITE_URL)) {
    setSiteSetting(KEY_PUBLIC_SITE_URL, envSite.replace(/\/$/, ""))
  }
  if (envReset && !getSiteSetting(KEY_COMP_RESET_SECRET)) {
    setSiteSetting(KEY_COMP_RESET_SECRET, envReset)
  }
}

function generateResetSecret(): string {
  return randomBytes(32).toString("hex")
}

export function ensureCompResetSecret(): string {
  seedFromEnvOnce()
  const existing =
    getSiteSetting(KEY_COMP_RESET_SECRET)?.trim() ||
    process.env.COMP_RESET_SECRET?.trim()
  if (existing) {
    if (!getSiteSetting(KEY_COMP_RESET_SECRET)) {
      setSiteSetting(KEY_COMP_RESET_SECRET, existing)
    }
    syncCompResetSecretFile(existing)
    return existing
  }
  const created = generateResetSecret()
  setSiteSetting(KEY_COMP_RESET_SECRET, created)
  syncCompResetSecretFile(created)
  return created
}

export function syncCompResetSecretFile(secret: string): void {
  const trimmed = secret.trim()
  if (!trimmed) return
  const file = compResetSecretFilePath()
  fs.writeFileSync(file, `${trimmed}\n`, { mode: 0o600 })
}

export function getEffectivePublicSiteUrl(): string | undefined {
  seedFromEnvOnce()
  const fromStore = getSiteSetting(KEY_PUBLIC_SITE_URL)?.trim()
  if (fromStore) return fromStore.replace(/\/$/, "")
  const fromEnv = process.env.SITE_URL?.trim()
  return fromEnv ? fromEnv.replace(/\/$/, "") : undefined
}

export function getEffectiveResendApiKey(): string | undefined {
  seedFromEnvOnce()
  const fromStore = getSiteSetting(KEY_RESEND_API_KEY)?.trim()
  if (fromStore) return fromStore
  const fromEnv = process.env.RESEND_API_KEY?.trim()
  return fromEnv || undefined
}

export function getEffectiveResendFrom():
  | { email: string; name: string }
  | undefined {
  seedFromEnvOnce()
  const email =
    getSiteSetting(KEY_FROM_EMAIL)?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim()
  if (!email) return undefined
  const name =
    getSiteSetting(KEY_FROM_NAME)?.trim() ||
    process.env.RESEND_FROM_NAME?.trim() ||
    "SMT"
  return { email, name }
}

export function getEffectiveSupportEmail(): string | undefined {
  seedFromEnvOnce()
  const fromStore = getSiteSetting(KEY_SUPPORT_EMAIL)?.trim()
  if (fromStore) return fromStore
  const fromEnv = process.env.RESEND_SUPPORT_EMAIL?.trim()
  const from = getEffectiveResendFrom()
  return fromEnv || from?.email
}

export function getEffectiveCompResetSecret(): string | undefined {
  seedFromEnvOnce()
  const fromStore = getSiteSetting(KEY_COMP_RESET_SECRET)?.trim()
  if (fromStore) return fromStore
  return process.env.COMP_RESET_SECRET?.trim() || undefined
}

export function getEmailSettings(): EmailSettings {
  seedFromEnvOnce()
  const from = getEffectiveResendFrom()
  return {
    publicSiteUrl: getEffectivePublicSiteUrl() || "",
    fromEmail: from?.email || "",
    fromName: from?.name || "SMT",
    supportEmail: getEffectiveSupportEmail() || "",
  }
}

export function getEmailSettingsForAdmin(): EmailSettingsAdminView {
  ensureCompResetSecret()
  const settings = getEmailSettings()
  const apiKeyConfigured = Boolean(getEffectiveResendApiKey())
  const resetSecretConfigured = Boolean(getEffectiveCompResetSecret())
  return {
    ...settings,
    apiKeyConfigured,
    resetSecretConfigured,
    mailConfigured: apiKeyConfigured && Boolean(settings.fromEmail),
  }
}

export function setEmailSettings(input: EmailSettingsInput): EmailSettingsAdminView {
  if (input.publicSiteUrl !== undefined) {
    const url = input.publicSiteUrl.trim().replace(/\/$/, "")
    setSiteSetting(KEY_PUBLIC_SITE_URL, url)
  }
  if (input.fromEmail !== undefined) {
    setSiteSetting(KEY_FROM_EMAIL, input.fromEmail.trim())
  }
  if (input.fromName !== undefined) {
    setSiteSetting(KEY_FROM_NAME, input.fromName.trim() || "SMT")
  }
  if (input.supportEmail !== undefined) {
    setSiteSetting(KEY_SUPPORT_EMAIL, input.supportEmail.trim())
  }
  if (input.apiKey !== undefined && input.apiKey.trim().length > 0) {
    setSiteSetting(KEY_RESEND_API_KEY, input.apiKey.trim())
  }
  if (input.resetSecret !== undefined && input.resetSecret.trim().length > 0) {
    const secret = input.resetSecret.trim()
    setSiteSetting(KEY_COMP_RESET_SECRET, secret)
    syncCompResetSecretFile(secret)
  }

  ensureCompResetSecret()
  return getEmailSettingsForAdmin()
}
