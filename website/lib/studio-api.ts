/**
 * Server-only proxy to channel studio API.
 * Never expose StudioToken to the browser.
 */

import { fetchQueueProcessing } from "@/lib/studio-agent-remote"
import {
  getEffectivePortraitPreviewUrl,
  getEffectivePortraitWorkerToken,
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

export type StudioDressResult = {
  ok: boolean
  mannequin?: string
  source?: string
  posed?: boolean
  dressed?: boolean
  error?: string
}

function studioBaseUrl(): string {
  return getEffectiveStudioUrl()
}

function studioToken(): string {
  return getEffectiveStudioToken()
}

async function studioFetch(
  path: string,
  init?: RequestInit
): Promise<{ status: number; json: Record<string, unknown> }> {
  const token = studioToken()
  if (!token) {
    throw new Error(
      "PORTRAIT_STUDIO_TOKEN is not set (Admin → Studio, or website .env)"
    )
  }
  const url = `${studioBaseUrl()}${path}`
  let res: Response
  try {
    res = await fetch(url, {
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
        ? `Studio API unreachable (${studioBaseUrl()}): ${e.message}`
        : "Studio API unreachable"
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

const CAPTURE_PROBE_MS = 1500
const CAPTURE_OK_TTL_MS = 60_000
const CAPTURE_DOWN_TTL_MS = 20_000

type CaptureProbeCache = {
  checkedAt: number
  /** Studio reachable + Process queue On. */
  pipelineReady: boolean
  vam1: boolean
  vaf1: boolean
}

let captureAvailabilityCache: CaptureProbeCache | null = null

/** For tests — clear the armory enqueue probe cache. */
export function resetPortraitCaptureAvailabilityCacheForTests(): void {
  captureAvailabilityCache = null
}

function mannequinOnlineForGender(
  probe: Pick<CaptureProbeCache, "vam1" | "vaf1">,
  gender?: number | null
): boolean {
  // 0 = male → vam1; 1 = female → vaf1
  if (gender === 0) return probe.vam1
  if (gender === 1) return probe.vaf1
  return probe.vam1 || probe.vaf1
}

function availableFromProbe(
  probe: CaptureProbeCache,
  gender?: number | null
): boolean {
  return (
    probe.pipelineReady && mannequinOnlineForGender(probe, gender)
  )
}

/**
 * True when a portrait can actually be captured soon: studio token set,
 * gender-matching mannequin online (vam1/vaf1), and Admin Process queue On.
 * Armory uses this so a paused/offline studio shows a placeholder instead of
 * "Capturing portrait…".
 */
export async function isPortraitCaptureAvailable(opts?: {
  gender?: number | null
  now?: number
}): Promise<boolean> {
  const now = opts?.now ?? Date.now()
  const gender = opts?.gender

  if (!studioToken()) {
    captureAvailabilityCache = {
      checkedAt: now,
      pipelineReady: false,
      vam1: false,
      vaf1: false,
    }
    return false
  }

  const cached = captureAvailabilityCache
  if (cached) {
    const available = availableFromProbe(cached, gender)
    const ttl = available ? CAPTURE_OK_TTL_MS : CAPTURE_DOWN_TTL_MS
    if (now - cached.checkedAt < ttl) return available
  }

  let probe: CaptureProbeCache = {
    checkedAt: now,
    pipelineReady: false,
    vam1: false,
    vaf1: false,
  }

  try {
    const agentConfigured =
      Boolean(getEffectivePortraitPreviewUrl()) &&
      Boolean(getEffectivePortraitWorkerToken())

    const [healthResult, queueResult] = await Promise.all([
      getStudioHealth({
        signal: AbortSignal.timeout(CAPTURE_PROBE_MS),
      }).then(
        (health) => ({ ok: true as const, health }),
        () => ({ ok: false as const })
      ),
      agentConfigured
        ? fetchQueueProcessing({ timeoutMs: CAPTURE_PROBE_MS }).then(
            (q) => ({ ok: true as const, q }),
            () => ({ ok: false as const })
          )
        : Promise.resolve({ ok: false as const }),
    ])

    const vam1 = healthResult.ok
      ? Boolean(healthResult.health.vam1 || healthResult.health.vam)
      : false
    const vaf1 = healthResult.ok
      ? Boolean(healthResult.health.vaf1 || healthResult.health.vaf)
      : false
    const queueEnabled =
      queueResult.ok && Boolean(queueResult.q.queueProcessing.enabled)
    const studioOk = healthResult.ok && healthResult.health.ok

    probe = {
      checkedAt: now,
      pipelineReady: studioOk && queueEnabled,
      vam1,
      vaf1,
    }
  } catch {
    // leave probe as not ready
  }

  captureAvailabilityCache = probe
  return availableFromProbe(probe, gender)
}

export async function dressStudioMannequin(input: {
  mannequin: string
  source: string
  pose?: boolean
  /** Floating name/title. Default true (admin). Worker uses false. */
  plate?: boolean
  zone?: number
  x?: number
  y?: number
}): Promise<StudioDressResult> {
  const mannequin = input.mannequin.trim()
  const source = input.source.trim()
  if (!mannequin || !source) {
    return { ok: false, error: "mannequin and source are required" }
  }
  const body: Record<string, unknown> = {
    mannequin,
    source,
    pose: input.pose !== false,
    plate: input.plate !== false,
  }
  if (input.zone != null) body.zone = input.zone
  if (input.x != null) body.x = input.x
  if (input.y != null) body.y = input.y

  const { json } = await studioFetch("/studio/dress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return {
    ok: Boolean(json.ok),
    mannequin:
      typeof json.mannequin === "string" ? json.mannequin : mannequin,
    source: typeof json.source === "string" ? json.source : source,
    posed: typeof json.posed === "boolean" ? json.posed : undefined,
    dressed: typeof json.dressed === "boolean" ? json.dressed : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
  }
}

export async function ensureStudioMannequinName(mannequin: string): Promise<{
  ok: boolean
  mannequin?: string
  name?: string
  repaired?: boolean
  error?: string
}> {
  const name = mannequin.trim()
  if (!name) {
    return { ok: false, error: "mannequin is required" }
  }
  const { json } = await studioFetch("/studio/ensure-name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mannequin: name }),
  })
  return {
    ok: Boolean(json.ok),
    mannequin: typeof json.mannequin === "string" ? json.mannequin : name,
    name: typeof json.name === "string" ? json.name : undefined,
    repaired: typeof json.repaired === "boolean" ? json.repaired : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
  }
}
