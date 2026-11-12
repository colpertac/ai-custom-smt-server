/**
 * Portrait / live-stats connection settings. Zero-config: deploy/install.sh generates the
 * secrets into deploy/.env and docker-compose passes them to the website:
 * - PORTRAIT_STUDIO_URL / PORTRAIT_STUDIO_TOKEN: channel studio HTTP API (StudioHttpPort /
 *   StudioToken; live armory stats), see armory-live.ts / studio-api.ts;
 * - PORTRAIT_WORKER_TOKEN: render worker auth (portrait queue), see portrait-worker-auth.ts.
 *
 * Env is the source of truth. Values an admin saved in site_settings before this became
 * zero-config are still read as a fallback, so installs that have not re-run install keep
 * working. Nothing writes these keys any more.
 */

import { getSiteSetting } from "@/lib/site-settings-store"

const KEY_STUDIO_URL = "portrait_studio_url"
const KEY_STUDIO_TOKEN = "portrait_studio_token"
const KEY_WORKER_TOKEN = "portrait_worker_token"

function env(name: string): string {
  return process.env[name]?.trim() || ""
}

function saved(key: string): string {
  try {
    return getSiteSetting(key)?.trim() || ""
  } catch {
    return ""
  }
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

/** Channel studio HTTP base (no trailing slash); "" when not configured. */
export function getEffectiveStudioUrl(): string {
  return stripSlash(env("PORTRAIT_STUDIO_URL") || saved(KEY_STUDIO_URL))
}

/** Shared secret for website → channel studio API; "" when not configured. */
export function getEffectiveStudioToken(): string {
  return (
    env("PORTRAIT_STUDIO_TOKEN") ||
    env("COMP_STUDIO_TOKEN") ||
    saved(KEY_STUDIO_TOKEN)
  )
}

/**
 * Render worker auth (portrait queue); "" when not configured.
 * Legacy: the old admin form reused the saved studio token when no worker token was saved.
 */
export function getEffectivePortraitWorkerToken(): string {
  return (
    env("PORTRAIT_WORKER_TOKEN") ||
    saved(KEY_WORKER_TOKEN) ||
    saved(KEY_STUDIO_TOKEN)
  )
}
