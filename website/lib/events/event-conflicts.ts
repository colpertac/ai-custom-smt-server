import type {
  EventConflictGroup,
  EventScheduleConfig,
  EventScheduleConflict,
  EventScheduleValidationResult,
} from "./types"
import {
  isValidDateKey,
  normalizeIds,
  parseFlipTime,
} from "./event-schedule-math"

/** Seeded mutual-exclusion groups (expand via event-conflicts.json). */
export const DEFAULT_CONFLICT_GROUPS: EventConflictGroup[] = [
  {
    id: "thoth-babel-home",
    reason:
      "Demon God Thoth uses the same Home III (69069) and Babel (69960) spots — Ordeal of Soul and Sage's Helper cannot run together.",
    eventIds: ["201501_ordeal", "201506_sage"],
  },
]

export function findConflictInSet(
  ids: Iterable<string>,
  groups: EventConflictGroup[]
): EventConflictGroup | null {
  const set = new Set(ids)
  for (const g of groups) {
    const hits = g.eventIds.filter((id) => set.has(id))
    if (hits.length >= 2) return { ...g, eventIds: hits }
  }
  return null
}

function checkDaySet(
  dayKey: string,
  eventIds: string[],
  alwaysOn: string[],
  known: Set<string> | null,
  groups: EventConflictGroup[],
  errors: string[],
  conflicts: EventScheduleConflict[]
): void {
  for (const id of eventIds) {
    if (known && !known.has(id)) {
      errors.push(`Day ${dayKey}: unknown event id ${id}`)
    }
  }
  const dayIds = normalizeIds(eventIds)
  const selfConflict = findConflictInSet(dayIds, groups)
  if (selfConflict) {
    conflicts.push({
      groupId: selfConflict.id,
      reason: selfConflict.reason,
      eventIds: selfConflict.eventIds,
      dayKeys: [dayKey],
      source: "day",
    })
  }
  const withAlways = findConflictInSet([...alwaysOn, ...dayIds], groups)
  if (withAlways && !selfConflict) {
    const needsAlways = withAlways.eventIds.some((id) => alwaysOn.includes(id))
    const needsDay = withAlways.eventIds.some((id) => dayIds.includes(id))
    if (needsAlways && needsDay) {
      conflicts.push({
        groupId: withAlways.id,
        reason: withAlways.reason,
        eventIds: withAlways.eventIds,
        dayKeys: [dayKey],
        source: "alwaysOn+day",
      })
    }
  }
}

export function validateSchedule(
  config: EventScheduleConfig,
  options?: {
    knownEventIds?: Set<string> | string[]
    conflictGroups?: EventConflictGroup[]
  }
): EventScheduleValidationResult {
  const errors: string[] = []
  const conflicts: EventScheduleConflict[] = []
  const groups = options?.conflictGroups ?? DEFAULT_CONFLICT_GROUPS
  const known = options?.knownEventIds
    ? new Set(
        Array.isArray(options.knownEventIds)
          ? options.knownEventIds
          : options.knownEventIds
      )
    : null

  if (config.version !== 2) {
    errors.push("Unsupported schedule version")
  }
  if (config.mode !== "loop" && config.mode !== "calendar") {
    errors.push('mode must be "loop" or "calendar"')
  }
  if (!config.timezone?.trim()) {
    errors.push("timezone is required")
  }
  const flip = parseFlipTime(config.flipTime || "")
  if (!/^\d{1,2}:\d{2}$/.test((config.flipTime || "").trim())) {
    errors.push("flipTime must be HH:mm")
  }
  void flip

  if (!isValidDateKey(config.loop?.anchorDate || "")) {
    errors.push("loop.anchorDate must be YYYY-MM-DD")
  }

  const alwaysOn = normalizeIds(config.alwaysOnIds)
  for (const id of alwaysOn) {
    if (known && !known.has(id)) {
      errors.push(`Unknown always-on event id: ${id}`)
    }
  }

  const alwaysConflict = findConflictInSet(alwaysOn, groups)
  if (alwaysConflict) {
    conflicts.push({
      groupId: alwaysConflict.id,
      reason: alwaysConflict.reason,
      eventIds: alwaysConflict.eventIds,
      dayKeys: [],
      source: "alwaysOn",
    })
  }

  const seenLoopIds = new Set<string>()
  for (const day of config.loop?.days ?? []) {
    if (!day.id?.trim()) {
      errors.push("Each loop day needs an id")
      continue
    }
    if (seenLoopIds.has(day.id)) {
      errors.push(`Duplicate loop day id: ${day.id}`)
    }
    seenLoopIds.add(day.id)
    checkDaySet(
      day.id,
      day.eventIds ?? [],
      alwaysOn,
      known,
      groups,
      errors,
      conflicts
    )
  }

  const seenDates = new Set<string>()
  for (const day of config.calendar?.days ?? []) {
    if (!isValidDateKey(day.date || "")) {
      errors.push(`Invalid calendar date: ${day.date}`)
      continue
    }
    if (seenDates.has(day.date)) {
      errors.push(`Duplicate calendar date: ${day.date}`)
    }
    seenDates.add(day.date)
    checkDaySet(
      day.date,
      day.eventIds ?? [],
      alwaysOn,
      known,
      groups,
      errors,
      conflicts
    )
  }

  return {
    ok: errors.length === 0 && conflicts.length === 0,
    errors,
    conflicts,
  }
}

/** Safety check for a concrete desired active set (reconciler). */
export function conflictsInActiveSet(
  activeIds: Iterable<string>,
  groups: EventConflictGroup[] = DEFAULT_CONFLICT_GROUPS
): EventScheduleConflict[] {
  const hit = findConflictInSet(activeIds, groups)
  if (!hit) return []
  return [
    {
      groupId: hit.id,
      reason: hit.reason,
      eventIds: hit.eventIds,
      dayKeys: [],
      source: "day",
    },
  ]
}
