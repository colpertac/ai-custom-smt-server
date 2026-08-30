function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

export function getCompApiUrl(): string {
  return (process.env.COMP_API_URL ?? "http://127.0.0.1:10999").replace(
    /\/$/,
    ""
  )
}

export function getSessionSecret(): string {
  return required("SESSION_SECRET")
}

/** Public site origin for CSRF checks and download copy (optional). */
export function getSiteUrl(): string | undefined {
  const value = process.env.SITE_URL?.trim()
  return value ? value.replace(/\/$/, "") : undefined
}

/**
 * Set COOKIE_SECURE=true when the browser uses HTTPS (TLS terminator in front).
 * Defaults false so HTTP Oracle/LAN portals still receive the session cookie.
 */
export function cookieSecure(): boolean {
  const explicit = process.env.COOKIE_SECURE?.trim().toLowerCase()
  if (explicit === "true" || explicit === "1") return true
  if (explicit === "false" || explicit === "0") return false
  return Boolean(getSiteUrl()?.startsWith("https://"))
}

export function getPublicUpdaterUrl(): string | undefined {
  const value = process.env.PUBLIC_UPDATER_URL?.trim()
  return value ? value.replace(/\/$/, "") : undefined
}

/** In-cluster updater base for status probes (compose: http://updater). */
export function getUpdaterProbeUrl(): string | undefined {
  const value = process.env.UPDATER_PROBE_URL?.trim()
  if (value) return value.replace(/\/$/, "")
  return getPublicUpdaterUrl()
}

export function getLobbyProbeHost(): string {
  return process.env.LOBBY_PROBE_HOST?.trim() || "lobby"
}

export function getChannelProbeHost(): string {
  return process.env.CHANNEL_PROBE_HOST?.trim() || "channel"
}

export function getLobbyProbePort(): number {
  return Number(process.env.LOBBY_PROBE_PORT ?? 10666) || 10666
}

export function getChannelProbePort(): number {
  return Number(process.env.CHANNEL_PROBE_PORT ?? 14666) || 14666
}

/** Resend — only use from server code (Route Handlers / Server Actions). */
export function getResendApiKey(): string | undefined {
  const value = process.env.RESEND_API_KEY?.trim()
  return value || undefined
}

export function getResendFrom(): { email: string; name: string } | undefined {
  const email = process.env.RESEND_FROM_EMAIL?.trim()
  if (!email) return undefined
  const name = process.env.RESEND_FROM_NAME?.trim() || "SMT"
  return { email, name }
}

/** Shared secret for website → lobby password-reset APIs (server-only). */
export function getCompResetSecret(): string | undefined {
  const value = process.env.COMP_RESET_SECRET?.trim()
  return value || undefined
}

/** Public site origin required for email links; falls back for local dev. */
export function getPublicAppUrl(): string {
  return getSiteUrl() || "http://localhost:3500"
}

