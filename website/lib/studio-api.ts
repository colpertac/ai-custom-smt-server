/**
 * Server-only client for the channel's studio HTTP API (StudioHttpPort / StudioToken).
 * Never expose StudioToken to the browser.
 *
 * Only `/studio/health` lives here: player counts subtract the vam/vaf mannequin accounts when
 * the channel reports them in-world. Live armory stats (`/armory/stats`) are in armory-live.ts.
 */

import {
  getEffectiveStudioToken,
  getEffectiveStudioUrl,
} from "@/lib/studio-settings-store"

export type StudioHealth = {
  ok: boolean
  vam1?: boolean
  vaf1?: boolean
  vam?: boolean
  vaf?: boolean
  va?: boolean
  error?: string
}

async function studioFetch(
  path: string,
  init?: RequestInit
): Promise<{ status: number; json: Record<string, unknown> }> {
  const token = getEffectiveStudioToken()
  if (!token) {
    throw new Error(
      "PORTRAIT_STUDIO_TOKEN is not set (Admin → Portraits, or website .env)"
    )
  }
  const base = getEffectiveStudioUrl()
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "X-Studio-Token": token,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    })
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? `Channel studio API unreachable (${base}): ${e.message}`
        : "Channel studio API unreachable"
    )
  }
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    json = { ok: false, error: `HTTP ${res.status}` }
  }
  return { status: res.status, json }
}

/** Channel `/studio/health`: which mannequin accounts (vam1 / vaf1) are in-world. */
export async function getStudioHealth(init?: {
  signal?: AbortSignal
}): Promise<StudioHealth> {
  const { json } = await studioFetch("/studio/health", {
    signal: init?.signal ?? AbortSignal.timeout(1_500),
  })
  return {
    ok: Boolean(json.ok),
    vam1: Boolean(json.vam1 ?? json.vam),
    vaf1: Boolean(json.vaf1 ?? json.vaf),
    vam: Boolean(json.vam1 ?? json.vam),
    vaf: Boolean(json.vaf1 ?? json.vaf),
    va: Boolean(json.va),
    error: typeof json.error === "string" ? json.error : undefined,
  }
}
