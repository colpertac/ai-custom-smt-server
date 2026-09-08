/**
 * Portrait studio connection settings (admin UI + env fallback).
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
const KEY_PREVIEW_URL = "portrait_preview_url"

export type StudioConnectionSettings = {
  studioUrl: string
  previewUrl: string
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
  previewUrl?: string
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
  const envPreview = process.env.PORTRAIT_PREVIEW_URL?.trim()

  if (envUrl && !getSiteSetting(KEY_STUDIO_URL)) {
    setSiteSetting(KEY_STUDIO_URL, envUrl.replace(/\/$/, ""))
  }
  if (envToken && !getSiteSetting(KEY_STUDIO_TOKEN)) {
    setSiteSetting(KEY_STUDIO_TOKEN, envToken)
  }
  if (envWorker && !getSiteSetting(KEY_WORKER_TOKEN)) {
    setSiteSetting(KEY_WORKER_TOKEN, envWorker)
  }
  if (envPreview && !getSiteSetting(KEY_PREVIEW_URL)) {
    setSiteSetting(KEY_PREVIEW_URL, envPreview.replace(/\/$/, ""))
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
 * Homelab worker / preview agent auth.
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

/** Homelab preview agent base (no trailing slash), or empty. */
export function getEffectivePortraitPreviewUrl(): string {
  seedFromEnvOnce()
  const fromStore = getSiteSetting(KEY_PREVIEW_URL)?.trim()
  if (fromStore) return fromStore.replace(/\/$/, "")
  return (process.env.PORTRAIT_PREVIEW_URL || "").trim().replace(/\/$/, "")
}

export function getStudioConnectionSettings(): StudioConnectionSettings {
  return {
    studioUrl: getEffectiveStudioUrl(),
    previewUrl: getEffectivePortraitPreviewUrl(),
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
  if (input.previewUrl !== undefined) {
    const url = input.previewUrl.trim().replace(/\/$/, "")
    if (url) setSiteSetting(KEY_PREVIEW_URL, url)
    else deleteSiteSetting(KEY_PREVIEW_URL)
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
