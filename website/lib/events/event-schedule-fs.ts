import { promises as fs } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { getEventsCatalog } from "./events-fs"
import {
  DEFAULT_CONFLICT_GROUPS,
  validateSchedule,
} from "./event-conflicts"
import {
  activeLoopDayIndex,
  activeScheduleDateKey,
  computeDesiredActiveIds,
  defaultEventScheduleConfig,
  expandUpcomingSlots,
  migrateV1ToV2,
  nextScheduleChangeAt,
  normalizeIds,
} from "./event-schedule-math"
import type {
  CompEvent,
  EventConflictGroup,
  EventScheduleConfig,
  EventScheduleConfigV1,
  EventScheduleStatus,
  EventScheduleValidationResult,
  ExpandedScheduleSlot,
  PublicEventsResponse,
} from "./types"
import { getLiveConfigDir } from "../server-config/fs"

/**
 * Always resolve from the Next.js app cwd. Do not use import.meta.url —
 * Turbopack/webpack rewrite it to chunk paths, which made the reconciler
 * miss website/content/events and fall back to enabled:false forever.
 */
function eventsContentDir(): string {
  return path.resolve(process.cwd(), "content", "events")
}

function schedulePath(): string {
  return path.join(eventsContentDir(), "event-schedule.json")
}

function conflictsPath(): string {
  return path.join(eventsContentDir(), "event-conflicts.json")
}

function statusPath(): string {
  return path.join(eventsContentDir(), "event-schedule-status.json")
}

/** @deprecated Prefer schedulePath() — kept for tests/debug. */
export const SCHEDULE_PATH = path.resolve(
  process.cwd(),
  "content",
  "events",
  "event-schedule.json"
)
export const STATUS_PATH = path.resolve(
  process.cwd(),
  "content",
  "events",
  "event-schedule-status.json"
)
export const CONFLICTS_PATH = path.resolve(
  process.cwd(),
  "content",
  "events",
  "event-conflicts.json"
)

export type ReconcilerPersistedStatus = {
  lastTickAt: string | null
  lastAppliedAt: string | null
  /** ISO of the flip instant we last applied/restarted for. */
  lastAppliedFlipAt: string | null
  lastDesiredIds: string[]
  lastError: string | null
  lastSkippedReason: string | null
  pendingRestartAt: string | null
  pendingDesiredIds: string[]
  announced10: boolean
  announced5: boolean
  announced1: boolean
}

const emptyReconcilerStatus = (): ReconcilerPersistedStatus => ({
  lastTickAt: null,
  lastAppliedAt: null,
  lastAppliedFlipAt: null,
  lastDesiredIds: [],
  lastError: null,
  lastSkippedReason: null,
  pendingRestartAt: null,
  pendingDesiredIds: [],
  announced10: false,
  announced5: false,
  announced1: false,
})

function isV1(raw: unknown): raw is EventScheduleConfigV1 {
  if (!raw || typeof raw !== "object") return false
  const o = raw as Record<string, unknown>
  return o.version === 1 && Array.isArray(o.windows)
}

function isV2(raw: unknown): raw is EventScheduleConfig {
  if (!raw || typeof raw !== "object") return false
  const o = raw as Record<string, unknown>
  return (
    o.version === 2 &&
    typeof o.enabled === "boolean" &&
    (o.mode === "loop" || o.mode === "calendar") &&
    typeof o.timezone === "string" &&
    Array.isArray(o.alwaysOnIds) &&
    o.loop !== null &&
    typeof o.loop === "object" &&
    o.calendar !== null &&
    typeof o.calendar === "object"
  )
}

function normalizeConfig(config: EventScheduleConfig): EventScheduleConfig {
  return {
    version: 2,
    enabled: Boolean(config.enabled),
    mode: config.mode === "calendar" ? "calendar" : "loop",
    timezone: config.timezone?.trim() || "America/New_York",
    flipTime: config.flipTime?.trim() || "04:00",
    alwaysOnIds: normalizeIds(config.alwaysOnIds ?? []),
    loop: {
      anchorDate: config.loop?.anchorDate || defaultEventScheduleConfig().loop.anchorDate,
      days: (config.loop?.days ?? []).map((d) => ({
        id: d.id?.trim() || randomUUID(),
        eventIds: normalizeIds(d.eventIds ?? []),
      })),
    },
    calendar: {
      days: (config.calendar?.days ?? []).map((d) => ({
        date: d.date,
        eventIds: normalizeIds(d.eventIds ?? []),
      })),
    },
  }
}

export async function loadConflictGroups(): Promise<EventConflictGroup[]> {
  try {
    const raw = await fs.readFile(conflictsPath(), "utf8")
    const parsed = JSON.parse(raw) as EventConflictGroup[]
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {
    /* fall through */
  }
  return DEFAULT_CONFLICT_GROUPS
}

export async function getEventSchedule(): Promise<EventScheduleConfig> {
  const file = schedulePath()
  try {
    const raw = await fs.readFile(file, "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (isV2(parsed)) {
      return normalizeConfig(parsed)
    }
    if (isV1(parsed)) {
      return normalizeConfig(migrateV1ToV2(parsed))
    }
    console.warn(
      `[EventSchedule] unrecognized schedule schema at ${file} — using defaults`
    )
  } catch (err) {
    console.warn(
      `[EventSchedule] failed to read ${file}:`,
      err instanceof Error ? err.message : err
    )
  }
  return defaultEventScheduleConfig()
}

export async function saveEventSchedule(
  config: EventScheduleConfig
): Promise<{
  config: EventScheduleConfig
  validation: EventScheduleValidationResult
}> {
  const catalog = await getEventsCatalog()
  const known = new Set(catalog.events.map((e) => e.id))
  const groups = await loadConflictGroups()
  const normalized = normalizeConfig(config)

  const validation = validateSchedule(normalized, {
    knownEventIds: known,
    conflictGroups: groups,
  })
  if (!validation.ok) {
    return { config: normalized, validation }
  }

  await fs.mkdir(eventsContentDir(), { recursive: true })
  await fs.writeFile(
    schedulePath(),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  )
  // Drop any armed flip countdown flags after a config edit so the next
  // reconciler tick re-reads desired vs live (Save itself does not restart).
  await writeReconcilerStatus({
    pendingRestartAt: null,
    pendingDesiredIds: [],
    announced10: false,
    announced5: false,
    announced1: false,
    lastSkippedReason: "config_saved",
    lastError: null,
  })
  return { config: normalized, validation }
}

export async function readReconcilerStatus(): Promise<ReconcilerPersistedStatus> {
  try {
    const raw = await fs.readFile(statusPath(), "utf8")
    const parsed = JSON.parse(raw) as Partial<ReconcilerPersistedStatus>
    return {
      ...emptyReconcilerStatus(),
      ...parsed,
      lastDesiredIds: Array.isArray(parsed.lastDesiredIds)
        ? parsed.lastDesiredIds.map(String)
        : [],
      pendingDesiredIds: Array.isArray(parsed.pendingDesiredIds)
        ? parsed.pendingDesiredIds.map(String)
        : [],
      announced10: Boolean(parsed.announced10),
      announced5: Boolean(parsed.announced5),
      announced1: Boolean(parsed.announced1),
    }
  } catch {
    return emptyReconcilerStatus()
  }
}

export async function writeReconcilerStatus(
  patch: Partial<ReconcilerPersistedStatus>
): Promise<ReconcilerPersistedStatus> {
  const prev = await readReconcilerStatus()
  const next: ReconcilerPersistedStatus = { ...prev, ...patch }
  await fs.mkdir(eventsContentDir(), { recursive: true })
  await fs.writeFile(statusPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8")
  return next
}

/** Parse active partial ids from live channel.xml (not working draft). */
export async function getLiveActiveEventIds(): Promise<string[]> {
  const livePath = path.join(getLiveConfigDir(), "channel.xml")
  let xml: string
  try {
    xml = await fs.readFile(livePath, "utf8")
  } catch {
    return []
  }
  const ids = new Set<string>()
  const storeMatch = xml.match(
    /<member name="DataStore">([\s\S]*?)<\/member>/
  )
  if (!storeMatch) return []
  for (const m of storeMatch[1].matchAll(
    /<element>\s*datastore\/partials\/([^<\s/]+)\s*<\/element>/g
  )) {
    ids.add(m[1])
  }
  return normalizeIds(ids)
}

export async function getEventScheduleStatus(
  now: Date = new Date()
): Promise<EventScheduleStatus> {
  const [config, liveActiveIds, reconciler] = await Promise.all([
    getEventSchedule(),
    getLiveActiveEventIds(),
    readReconcilerStatus(),
  ])
  const desiredActiveIds = config.enabled
    ? computeDesiredActiveIds(config, now)
    : liveActiveIds

  return {
    config,
    activeLoopDayIndex:
      config.mode === "loop" ? activeLoopDayIndex(config, now) : null,
    activeCalendarDate:
      config.mode === "calendar"
        ? activeScheduleDateKey(now, config.flipTime, config.timezone)
        : null,
    desiredActiveIds,
    liveActiveIds,
    nextChangeAt: config.enabled ? nextScheduleChangeAt(config, now) : null,
    reconciler: {
      lastTickAt: reconciler.lastTickAt,
      lastAppliedAt: reconciler.lastAppliedAt,
      lastDesiredIds: reconciler.lastDesiredIds,
      lastError: reconciler.lastError,
      lastSkippedReason: reconciler.lastSkippedReason,
      pendingRestartAt: reconciler.pendingRestartAt,
      announced10: reconciler.announced10,
      announced5: reconciler.announced5,
      announced1: reconciler.announced1,
    },
  }
}

function eventsById(catalogEvents: CompEvent[]): Map<string, CompEvent> {
  return new Map(catalogEvents.map((e) => [e.id, e]))
}

function resolveEvents(
  ids: string[],
  byId: Map<string, CompEvent>
): CompEvent[] {
  return ids
    .map((id) => byId.get(id))
    .filter((e): e is CompEvent => Boolean(e))
}

export async function getPublicEventsResponse(
  now: Date = new Date()
): Promise<PublicEventsResponse> {
  const [config, catalog, liveIds] = await Promise.all([
    getEventSchedule(),
    getEventsCatalog(),
    getLiveActiveEventIds(),
  ])
  const byId = eventsById(catalog.events)
  const alwaysOn = resolveEvents(normalizeIds(config.alwaysOnIds), byId)

  const currentIds = config.enabled
    ? computeDesiredActiveIds(config, now)
    : liveIds
  const current = resolveEvents(currentIds, byId)

  let upcomingSlots: ExpandedScheduleSlot[] = []
  if (config.enabled) {
    // ~3 months so the public calendar can browse past the near-term strip.
    const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60_000)
    upcomingSlots = expandUpcomingSlots(config, now, horizon, 120).filter(
      (s) => Date.parse(s.startsAt) > now.getTime() - 60_000
    )
  }

  const upcoming = upcomingSlots.map((s) => ({
    dayKey: s.dayKey,
    title: s.title,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    events: resolveEvents(s.eventIds, byId),
  }))

  return {
    scheduleEnabled: config.enabled,
    timezone: config.timezone,
    mode: config.enabled ? config.mode : null,
    flipTime: config.enabled ? config.flipTime : null,
    current,
    upcoming,
    alwaysOn,
  }
}
