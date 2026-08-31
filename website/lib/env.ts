import {
  getEffectiveCompResetSecret,
  getEffectivePublicSiteUrl,
  getEffectiveResendApiKey,
  getEffectiveResendFrom,
} from "@/lib/email-settings-store"

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
  return getEffectivePublicSiteUrl()
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
  const publicUrl = getPublicUpdaterUrl()
  if (publicUrl) return publicUrl
  if (isLocalCompApiHost()) return "http://127.0.0.1:8765"
  return undefined
}

function compApiHostname(): string | null {
  try {
    return new URL(getCompApiUrl()).hostname || null
  } catch {
    return null
  }
}

/** True when lobby HTTP API targets loopback (native dev), not compose service names. */
function isLocalCompApiHost(): boolean {
  const host = compApiHostname()
  return host === "127.0.0.1" || host === "localhost" || host === "::1"
}

/** Host for game TCP probes when LOBBY_/CHANNEL_ probe env vars are unset. */
export function getGameProbeHost(): string {
  const lobbyCustom = process.env.LOBBY_PROBE_HOST?.trim()
  if (lobbyCustom) return lobbyCustom
  if (isLocalCompApiHost()) return "127.0.0.1"
  return compApiHostname() || "lobby"
}

export function getLobbyProbeHost(): string {
  return process.env.LOBBY_PROBE_HOST?.trim() || getGameProbeHost()
}

export function getChannelProbeHost(): string {
  return process.env.CHANNEL_PROBE_HOST?.trim() || getGameProbeHost()
}

export function getWorldProbeHost(): string {
  return process.env.WORLD_PROBE_HOST?.trim() || getGameProbeHost()
}

export function getLobbyProbePort(): number {
  return Number(process.env.LOBBY_PROBE_PORT ?? 10666) || 10666
}

export function getWorldProbePort(): number {
  return Number(process.env.WORLD_PROBE_PORT ?? 18666) || 18666
}

export function getChannelProbePort(): number {
  return Number(process.env.CHANNEL_PROBE_PORT ?? 14666) || 14666
}

/** Resend — only use from server code (Route Handlers / Server Actions). */
export function getResendApiKey(): string | undefined {
  return getEffectiveResendApiKey()
}

export function getResendFrom(): { email: string; name: string } | undefined {
  return getEffectiveResendFrom()
}

/** Shared secret for website → lobby password-reset APIs (server-only). */
export function getCompResetSecret(): string | undefined {
  return getEffectiveCompResetSecret()
}

/** Public site origin required for email links; falls back for local dev. */
export function getPublicAppUrl(): string {
  return getSiteUrl() || "http://localhost:3500"
}

