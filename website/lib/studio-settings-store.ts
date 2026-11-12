/**
 * Admin → Portraits connection settings (admin UI + env fallback):
 * - channel studio HTTP API URL + token (StudioHttpPort / StudioToken; live armory stats,
 *   mannequin presence), see armory-live.ts / studio-api.ts;
 * - render worker token (portrait queue auth), see portrait-worker-auth.ts.
 * Secrets stay server-side; admin GET only returns configured flags.
 */

import {
  deleteSiteSetting,
  getSiteSetting,
  setSiteSetting,
} from "@/lib/site-settings-store"

const KEY_STUDIO_URL = "portrait_studio_url"
const KEY_STUDIO_TOKEN = "portrait_studio_token"
const KEY_WORKER_TOKEN = "portrait_worker_token"

export type StudioConnectionSettings = {
  studioUrl: string
}

export type StudioConnectionAdminView = StudioConnectionSettings & {
  studioTokenConfigured: boolean
  workerTokenConfigured: boolean
  /** True when effective token comes only from env (not site_settings). */
  studioTokenFromEnv: boolean
  workerTokenFromEnv: boolean
}

export type StudioConnectionInput = {
  studioUrl?: string
  /** Non-empty replaces; empty string leaves unchanged. */
  studioToken?: string
  workerToken?: string
  clearStudioToken?: boolean
  clearWorkerToken?: boolean
}

let envSeeded = false

function seedFromEnvOnce(): void {
  if (envSeeded) return
  envSeeded = true

  const envUrl = process.env.PORTRAIT_STUDIO_URL?.trim()
  const envToken =
    process.env.PORTRAIT_STUDIO_TOKEN?.trim() ||
    process.env.COMP_STUDIO_TOKEN?.trim()
  const envWorker = process.env.PORTRAIT_WORKER_TOKEN?.trim()

  if (envUrl && !getSiteSetting(KEY_STUDIO_URL)) {
    setSiteSetting(KEY_STUDIO_URL, envUrl.replace(/\/$/, ""))
  }
  if (envToken && !getSiteSetting(KEY_STUDIO_TOKEN)) {
    setSiteSetting(KEY_STUDIO_TOKEN, envToken)
  }
  if (envWorker && !getSiteSetting(KEY_WORKER_TOKEN)) {
    setSiteSetting(KEY_WORKER_TOKEN, envWorker)
  }
}

function envStudioToken(): string {
  return (
    process.env.PORTRAIT_STUDIO_TOKEN?.trim() ||
    process.env.COMP_STUDIO_TOKEN?.trim() ||
    ""
  )
}

function envWorkerToken(): string {
  return process.env.PORTRAIT_WORKER_TOKEN?.trim() || ""
}

/** Channel studio HTTP base (no trailing slash). */
export function getEffectiveStudioUrl(): string {
  seedFromEnvOnce()
  const fromStore = getSiteSetting(KEY_STUDIO_URL)?.trim()
  if (fromStore) return fromStore.replace(/\/$/, "")
  const fromEnv = process.env.PORTRAIT_STUDIO_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  return "http://127.0.0.1:14700"
}

/** Shared secret for website → channel studio API. */
export function getEffectiveStudioToken(): string {
  seedFromEnvOnce()
  return getSiteSetting(KEY_STUDIO_TOKEN)?.trim() || envStudioToken()
}

/**
 * Render worker auth (portrait queue).
 * Prefer dedicated worker token; fall back to studio token.
 */
export function getEffectivePortraitWorkerToken(): string {
  seedFromEnvOnce()
  return (
    getSiteSetting(KEY_WORKER_TOKEN)?.trim() ||
    envWorkerToken() ||
    getEffectiveStudioToken()
  )
}

export function getStudioConnectionSettings(): StudioConnectionSettings {
  return {
    studioUrl: getEffectiveStudioUrl(),
  }
}

export function getStudioConnectionForAdmin(): StudioConnectionAdminView {
  seedFromEnvOnce()
  const storeToken = Boolean(getSiteSetting(KEY_STUDIO_TOKEN)?.trim())
  const storeWorker = Boolean(getSiteSetting(KEY_WORKER_TOKEN)?.trim())
  const studioTokenConfigured = Boolean(getEffectiveStudioToken())
  const workerDedicated = Boolean(
    getSiteSetting(KEY_WORKER_TOKEN)?.trim() || envWorkerToken()
  )
  return {
    ...getStudioConnectionSettings(),
    studioTokenConfigured,
    workerTokenConfigured: workerDedicated || studioTokenConfigured,
    studioTokenFromEnv: !storeToken && Boolean(envStudioToken()),
    workerTokenFromEnv: !storeWorker && Boolean(envWorkerToken()),
  }
}

export function setStudioConnectionSettings(
  input: StudioConnectionInput
): StudioConnectionAdminView {
  if (input.studioUrl !== undefined) {
    const url = input.studioUrl.trim().replace(/\/$/, "")
    setSiteSetting(KEY_STUDIO_URL, url)
  }
  if (input.clearStudioToken) {
    deleteSiteSetting(KEY_STUDIO_TOKEN)
  } else if (input.studioToken !== undefined && input.studioToken.trim()) {
    setSiteSetting(KEY_STUDIO_TOKEN, input.studioToken.trim())
  }
  if (input.clearWorkerToken) {
    deleteSiteSetting(KEY_WORKER_TOKEN)
  } else if (input.workerToken !== undefined && input.workerToken.trim()) {
    setSiteSetting(KEY_WORKER_TOKEN, input.workerToken.trim())
  }
  return getStudioConnectionForAdmin()
}
