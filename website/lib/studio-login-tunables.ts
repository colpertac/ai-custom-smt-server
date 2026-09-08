/**
 * Login / orch tunables for portrait mannequins.
 * Admin UI edits; Wine host pulls via worker token before orch/login.
 */

import {
  getSiteSetting,
  setSiteSetting,
} from "@/lib/site-settings-store"

const KEY = "portrait_login_tunables"

export type StudioLoginTunables = {
  splashEscCount: number
  splashEscGapSec: number
  splashSettleSec: number
  afterEnterSec: number
  /** Pause after Tab / Shift+Tab before typing (Wine often drops a fast Tab). */
  fieldGapSec: number
  /** Per-character delay for xdotool type (ms). */
  typeDelayMs: number
  startXFrac: number
  startYFrac: number
  startClickCount: number
  startClickGapSec: number
  startClickJitterPx: number
  afterLaunchSec: number
  onlineTimeoutSec: number
  loginRetries: number
  charSelectSec: number
  /** Capture + upload window snaps during orch/login. */
  debugScreenshots: boolean
}

export const DEFAULT_STUDIO_LOGIN_TUNABLES: StudioLoginTunables = {
  splashEscCount: 3,
  splashEscGapSec: 0.6,
  splashSettleSec: 2.0,
  afterEnterSec: 8.0,
  fieldGapSec: 0.55,
  typeDelayMs: 35,
  startXFrac: 0.05127,
  startYFrac: 0.936719,
  startClickCount: 8,
  startClickGapSec: 0.25,
  startClickJitterPx: 12,
  afterLaunchSec: 8.0,
  onlineTimeoutSec: 60,
  loginRetries: 3,
  charSelectSec: 3,
  debugScreenshots: true,
}

function num(
  raw: unknown,
  fallback: number,
  opts?: { int?: boolean; min?: number; max?: number }
): number {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  let v = opts?.int ? Math.round(n) : n
  if (opts?.min != null) v = Math.max(opts.min, v)
  if (opts?.max != null) v = Math.min(opts.max, v)
  return v
}

export function parseStudioLoginTunables(
  raw: unknown
): StudioLoginTunables {
  const d = DEFAULT_STUDIO_LOGIN_TUNABLES
  if (!raw || typeof raw !== "object") return { ...d }
  const o = raw as Record<string, unknown>
  return {
    splashEscCount: num(o.splashEscCount, d.splashEscCount, {
      int: true,
      min: 1,
      max: 20,
    }),
    splashEscGapSec: num(o.splashEscGapSec, d.splashEscGapSec, {
      min: 0,
      max: 10,
    }),
    splashSettleSec: num(o.splashSettleSec, d.splashSettleSec, {
      min: 0,
      max: 60,
    }),
    afterEnterSec: num(o.afterEnterSec, d.afterEnterSec, {
      min: 0,
      max: 120,
    }),
    fieldGapSec: num(o.fieldGapSec, d.fieldGapSec, {
      min: 0,
      max: 5,
    }),
    typeDelayMs: num(o.typeDelayMs, d.typeDelayMs, {
      int: true,
      min: 0,
      max: 200,
    }),
    startXFrac: num(o.startXFrac, d.startXFrac, { min: 0, max: 1 }),
    startYFrac: num(o.startYFrac, d.startYFrac, { min: 0, max: 1 }),
    startClickCount: num(o.startClickCount, d.startClickCount, {
      int: true,
      min: 1,
      max: 40,
    }),
    startClickGapSec: num(o.startClickGapSec, d.startClickGapSec, {
      min: 0,
      max: 5,
    }),
    startClickJitterPx: num(o.startClickJitterPx, d.startClickJitterPx, {
      int: true,
      min: 0,
      max: 80,
    }),
    afterLaunchSec: num(o.afterLaunchSec, d.afterLaunchSec, {
      min: 0,
      max: 120,
    }),
    onlineTimeoutSec: num(o.onlineTimeoutSec, d.onlineTimeoutSec, {
      min: 5,
      max: 600,
    }),
    loginRetries: num(o.loginRetries, d.loginRetries, {
      int: true,
      min: 1,
      max: 10,
    }),
    charSelectSec: num(o.charSelectSec, d.charSelectSec, {
      min: 0,
      max: 60,
    }),
    debugScreenshots:
      typeof o.debugScreenshots === "boolean"
        ? o.debugScreenshots
        : d.debugScreenshots,
  }
}

export function getStudioLoginTunables(): StudioLoginTunables {
  const raw = getSiteSetting(KEY)
  if (!raw?.trim()) return { ...DEFAULT_STUDIO_LOGIN_TUNABLES }
  try {
    return parseStudioLoginTunables(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_STUDIO_LOGIN_TUNABLES }
  }
}

export function setStudioLoginTunables(
  input: Partial<StudioLoginTunables>
): StudioLoginTunables {
  const next = parseStudioLoginTunables({
    ...getStudioLoginTunables(),
    ...input,
  })
  setSiteSetting(KEY, JSON.stringify(next))
  return next
}

/** Map tunables → PORTRAIT_* env names for the Wine host. */
export function studioLoginTunablesToEnv(
  t: StudioLoginTunables
): Record<string, string> {
  return {
    PORTRAIT_LOGIN_SPLASH_ESC: String(t.splashEscCount),
    PORTRAIT_LOGIN_SPLASH_ESC_GAP: String(t.splashEscGapSec),
    PORTRAIT_LOGIN_SPLASH_SETTLE: String(t.splashSettleSec),
    PORTRAIT_LOGIN_AFTER_ENTER_SEC: String(t.afterEnterSec),
    PORTRAIT_LOGIN_FIELD_GAP_SEC: String(t.fieldGapSec),
    PORTRAIT_LOGIN_TYPE_DELAY_MS: String(t.typeDelayMs),
    PORTRAIT_START_X_FRAC: String(t.startXFrac),
    PORTRAIT_START_Y_FRAC: String(t.startYFrac),
    PORTRAIT_LOGIN_START_CLICKS: String(t.startClickCount),
    PORTRAIT_LOGIN_START_CLICK_GAP: String(t.startClickGapSec),
    PORTRAIT_LOGIN_START_JITTER: String(t.startClickJitterPx),
    PORTRAIT_LOGIN_AFTER_LAUNCH_SEC: String(t.afterLaunchSec),
    PORTRAIT_ORCH_ONLINE_TIMEOUT: String(t.onlineTimeoutSec),
    PORTRAIT_ORCH_LOGIN_RETRIES: String(t.loginRetries),
    PORTRAIT_ORCH_CHAR_SELECT_SEC: String(t.charSelectSec),
    PORTRAIT_DEBUG_SCREENSHOTS: t.debugScreenshots ? "1" : "0",
  }
}
