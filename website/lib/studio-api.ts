/**
 * Server-only client for the channel's studio HTTP API (StudioHttpPort / StudioToken).
 * Never expose StudioToken to the browser.
 *
 * Only `/studio/health` lives here: Admin → Portraits shows whether live armory stats can reach
 * the channel. Live armory stats (`/armory/stats`) are in armory-live.ts.
 */

import {
  getEffectiveStudioToken,
  getEffectiveStudioUrl,
} from "@/lib/studio-settings-store"

async function studioFetch(
  path: string,
  init?: RequestInit
): Promise<{ status: number; json: Record<string, unknown> }> {
  const token = getEffectiveStudioToken()
  const base = getEffectiveStudioUrl()
  if (!token || !base) {
    throw new Error(
      "PORTRAIT_STUDIO_URL / PORTRAIT_STUDIO_TOKEN not set (deploy/install.sh writes them)"
    )
  }
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

/**
 * Whether the website can use the channel studio API (live armory stats):
 * - `connected`: `/studio/health` answered with our token;
 * - `rejected`: channel answered but refused the token (StudioToken differs);
 * - `unreachable`: no answer (channel down, studio API off, wrong URL);
 * - `not_configured`: no URL or token on the website.
 */
export type StudioConnectionState =
  | "connected"
  | "rejected"
  | "unreachable"
  | "not_configured"

const PROBE_CACHE_MS = 5_000
const PROBE_TIMEOUT_MS = 1_500

let probeCache: { at: number; state: StudioConnectionState } | null = null
let probeInFlight: Promise<StudioConnectionState> | null = null

async function probeOnce(): Promise<StudioConnectionState> {
  if (!getEffectiveStudioToken() || !getEffectiveStudioUrl()) {
    return "not_configured"
  }
  let result: { status: number; json: Record<string, unknown> }
  try {
    result = await studioFetch("/studio/health", {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch {
    return "unreachable"
  }
  if (
    result.status === 401 ||
    result.status === 403 ||
    result.json.error === "unauthorized"
  ) {
    return "rejected"
  }
  return result.json.ok ? "connected" : "unreachable"
}

/** Cheap cached probe of the channel studio API (short timeout, cached a few seconds). */
export async function probeStudioConnection(
  now = Date.now()
): Promise<StudioConnectionState> {
  if (probeCache && now - probeCache.at < PROBE_CACHE_MS) return probeCache.state
  if (!probeInFlight) {
    probeInFlight = probeOnce()
      .then((state) => {
        probeCache = { at: Date.now(), state }
        return state
      })
      .finally(() => {
        probeInFlight = null
      })
  }
  return probeInFlight
}

/** Test hook: forget the cached probe result. */
export function resetStudioProbeCache(): void {
  probeCache = null
  probeInFlight = null
}
