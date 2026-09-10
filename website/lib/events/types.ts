export type EventCategory =
  | "all"
  | "summer"
  | "halloween"
  | "xmas"
  | "valentines"
  | "anniversary"
  | "collab"
  | "gag"
  | "special"

/** Resolved spawn of an event NPC (SpotID → SpotData centerX/Y). */
export interface EventNpcSpawn {
  name: string
  nameJp?: string
  /**
   * ID from the partial's DynamicMapIDs list (used for SpotData lookup).
   * Often a DynamicMapID, not a ServerZone ID — see serverZoneId.
   */
  zoneId: number
  zoneName: string
  /** ServerZone.ID when zoneId was resolved as a DynamicMapID. */
  serverZoneId?: number | null
  spotId: number
  x: number | null
  y: number | null
}

export interface CompEvent {
  id: string
  folder: string
  titleJp: string
  titleEn: string
  category: EventCategory
  year: number
  month: number
  summary: string
  /** Player-facing how-to shown on the public events page. */
  notes?: string
  /** Technical / GM notes shown only in admin event details. */
  adminNotes?: string
  affectedZones: string[]
  featuredNpcs: string[]
  /** Detailed NPC placements when SpotData resolves (may be empty). */
  npcSpawns: EventNpcSpawn[]
  xmlCount: number
}

export interface EventsCatalog {
  version: number
  generatedAt: string
  events: CompEvent[]
}

export interface EventStatus extends CompEvent {
  active: boolean
}

export interface AdminEventsResponse {
  events: EventStatus[]
  activeCount: number
  isDirty: boolean
  workingXmlPath: string
  liveXmlPath: string
}

export interface UpdateEventsRequest {
  activeIds?: string[]
  eventId?: string
  enabled?: boolean
}

export interface UpdateEventsResponse {
  success: boolean
  activeCount: number
  activeIds: string[]
  isDirty: boolean
  warnings?: string[]
}

export type EventScheduleMode = "loop" | "calendar"

export interface EventScheduleLoopDay {
  id: string
  eventIds: string[]
}

export interface EventScheduleCalendarDay {
  /** YYYY-MM-DD */
  date: string
  eventIds: string[]
}

export interface EventScheduleLoopV2 {
  /** YYYY-MM-DD; day 1 starts at flipTime on this date (in timezone). */
  anchorDate: string
  days: EventScheduleLoopDay[]
}

export interface EventScheduleCalendarV2 {
  days: EventScheduleCalendarDay[]
}

/** v2 looping / calendar day-assignment schedule. */
export interface EventScheduleConfig {
  version: 2
  enabled: boolean
  mode: EventScheduleMode
  timezone: string
  /** HH:mm local in timezone — when the active day advances. */
  flipTime: string
  alwaysOnIds: string[]
  loop: EventScheduleLoopV2
  calendar: EventScheduleCalendarV2
}

/** @deprecated v1 shape kept for migrate-on-read only. */
export interface EventScheduleConfigV1 {
  version: 1
  enabled: boolean
  timezone: string
  alwaysOnIds: string[]
  loop: { cycleDays: number; anchorAt: string }
  windows: Array<{
    id: string
    title?: string
    eventIds: string[]
    startOffsetMinutes: number
    endOffsetMinutes: number
  }>
}

export interface EventConflictGroup {
  id: string
  reason: string
  eventIds: string[]
}

export interface EventScheduleConflict {
  groupId: string
  reason: string
  eventIds: string[]
  /** Day ids or calendar dates involved. */
  dayKeys: string[]
  source: "alwaysOn" | "day" | "alwaysOn+day"
}

export interface EventScheduleValidationResult {
  ok: boolean
  errors: string[]
  conflicts: EventScheduleConflict[]
}

/** Saved or builtin loop-mode day plan (does not include calendar/timezone). */
export interface EventScheduleLoopProfile {
  id: string
  name: string
  description: string
  /** Built-in presets cannot be overwritten or deleted. */
  builtin: boolean
  createdAt: string
  updatedAt: string
  alwaysOnIds: string[]
  days: EventScheduleLoopDay[]
}

export interface EventScheduleProfilesFile {
  version: 1
  profiles: EventScheduleLoopProfile[]
}

export interface ExpandedScheduleSlot {
  dayKey: string
  title?: string
  eventIds: string[]
  startsAt: string
  endsAt: string
}

export interface EventScheduleStatus {
  config: EventScheduleConfig
  /** 0-based loop day index, or null if N/A. */
  activeLoopDayIndex: number | null
  /** Active calendar date YYYY-MM-DD when in calendar mode. */
  activeCalendarDate: string | null
  desiredActiveIds: string[]
  liveActiveIds: string[]
  nextChangeAt: string | null
  reconciler: {
    lastTickAt: string | null
    lastAppliedAt: string | null
    lastDesiredIds: string[]
    lastError: string | null
    lastSkippedReason: string | null
    pendingRestartAt: string | null
    announced10: boolean
    announced5: boolean
    announced1: boolean
  }
}

export interface PublicEventsResponse {
  scheduleEnabled: boolean
  timezone: string
  mode: EventScheduleMode | null
  flipTime: string | null
  current: CompEvent[]
  upcoming: Array<{
    dayKey: string
    title?: string
    startsAt: string
    endsAt: string
    events: CompEvent[]
  }>
  alwaysOn: CompEvent[]
}
