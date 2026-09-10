import { randomUUID } from "node:crypto"

import { DEFAULT_CONFLICT_GROUPS } from "./event-conflicts"
import {
  DENSE_ARCHIVE_DESCRIPTION,
  DENSE_ARCHIVE_PROFILE_ID,
} from "./loop-profile-utils"
import type {
  CompEvent,
  EventConflictGroup,
  EventScheduleLoopDay,
  EventScheduleLoopProfile,
} from "./types"

export {
  DENSE_ARCHIVE_DESCRIPTION,
  DENSE_ARCHIVE_PROFILE_ID,
  cloneProfileDays,
} from "./loop-profile-utils"
const DEFAULT_ALWAYS_ON = ["201604_misc"]

/** Companion overlays that should share a day with their parent. */
const COMPANION_OF: Record<string, string> = {
  "201006_kappa1_weather": "201006_kappa1",
}

function isBundle(id: string): boolean {
  return id.startsWith("all_")
}

/** Soft mutex: events that place an NPC on the same zone+spot. */
export function buildSpotConflictGroups(
  events: CompEvent[]
): EventConflictGroup[] {
  const bySpot = new Map<string, Set<string>>()
  for (const e of events) {
    for (const s of e.npcSpawns ?? []) {
      if (s.zoneId == null || s.spotId == null) continue
      const key = `${s.zoneId}:${s.spotId}`
      let set = bySpot.get(key)
      if (!set) {
        set = new Set()
        bySpot.set(key, set)
      }
      set.add(e.id)
    }
  }
  const groups: EventConflictGroup[] = []
  let i = 0
  for (const [key, ids] of bySpot) {
    if (ids.size < 2) continue
    groups.push({
      id: `spot-${key}-${i++}`,
      reason: `Shared NPC spot ${key}`,
      eventIds: [...ids].sort(),
    })
  }
  return groups
}

/** Main vs *_post lifecycle pairs. */
export function buildLifecycleConflictGroups(
  eventIds: Iterable<string>
): EventConflictGroup[] {
  const set = new Set(eventIds)
  const groups: EventConflictGroup[] = []
  for (const id of set) {
    if (!id.endsWith("_post")) continue
    const main = id.slice(0, -"_post".length)
    if (!set.has(main)) continue
    groups.push({
      id: `lifecycle-${main}`,
      reason: `${main} and ${id} are main/post lifecycle states — not both on the same day`,
      eventIds: [main, id],
    })
  }
  return groups
}

function adjacencyFromGroups(
  groups: EventConflictGroup[]
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  const touch = (a: string, b: string) => {
    if (a === b) return
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const g of groups) {
    for (let i = 0; i < g.eventIds.length; i++) {
      for (let j = i + 1; j < g.eventIds.length; j++) {
        touch(g.eventIds[i]!, g.eventIds[j]!)
      }
    }
  }
  return adj
}

function dayConflicts(
  candidate: string,
  day: Set<string>,
  adj: Map<string, Set<string>>
): boolean {
  const foes = adj.get(candidate)
  if (!foes) return false
  for (const id of day) {
    if (foes.has(id)) return true
  }
  return false
}

export type DenseArchiveResult = {
  alwaysOnIds: string[]
  days: EventScheduleLoopDay[]
  /** Events left out because they conflicted with always-on or were bundles. */
  skippedIds: string[]
  spotGroupCount: number
  lifecycleGroupCount: number
}

/**
 * Greedy dense pack: most-constrained events first; open a new day when needed.
 * Glues companion overlays onto their parent day’s placement.
 */
export function buildDenseArchiveCycle(
  events: CompEvent[],
  options?: {
    alwaysOnIds?: string[]
    hardGroups?: EventConflictGroup[]
    /** Soft target — algorithm may use more days if needed. */
    targetDays?: number
  }
): DenseArchiveResult {
  const alwaysOnIds = [
    ...new Set(options?.alwaysOnIds ?? DEFAULT_ALWAYS_ON),
  ].sort()
  const alwaysSet = new Set(alwaysOnIds)
  const hardGroups = options?.hardGroups ?? DEFAULT_CONFLICT_GROUPS
  const targetDays = Math.max(7, options?.targetDays ?? 14)

  const known = events.map((e) => e.id)
  const spotGroups = buildSpotConflictGroups(events)
  const lifeGroups = buildLifecycleConflictGroups(known)
  const adj = adjacencyFromGroups([
    ...hardGroups,
    ...spotGroups,
    ...lifeGroups,
  ])

  const skippedIds: string[] = []
  const pool: string[] = []
  for (const e of events) {
    if (isBundle(e.id)) {
      skippedIds.push(e.id)
      continue
    }
    if (alwaysSet.has(e.id)) continue
    // Companions are placed with their parent, not as free agents.
    if (COMPANION_OF[e.id]) continue
    pool.push(e.id)
  }

  // Drop anything that conflicts with always-on.
  const free: string[] = []
  for (const id of pool) {
    if (dayConflicts(id, alwaysSet, adj)) {
      skippedIds.push(id)
      continue
    }
    free.push(id)
  }

  free.sort((a, b) => {
    const da = adj.get(a)?.size ?? 0
    const db = adj.get(b)?.size ?? 0
    if (db !== da) return db - da
    return a.localeCompare(b)
  })

  const days: Set<string>[] = Array.from(
    { length: targetDays },
    () => new Set<string>()
  )

  const place = (id: string): boolean => {
    let best: number | null = null
    let bestSize = Infinity
    for (let i = 0; i < days.length; i++) {
      const day = days[i]!
      if (dayConflicts(id, day, adj) || dayConflicts(id, alwaysSet, adj)) {
        continue
      }
      if (day.size < bestSize) {
        bestSize = day.size
        best = i
      }
    }
    if (best == null) {
      days.push(new Set())
      best = days.length - 1
    }
    days[best]!.add(id)
    return true
  }

  // Prefer early days for Kappa arc order (still subject to conflicts).
  const kappaOrder = [
    "201006_kappa1",
    "201006_kappa2",
    "201007_kappa3",
    "201008_kappa4",
    "201406_kappa5",
    "201407_kappa6",
  ]
  const kappaSet = new Set(kappaOrder)
  const kappaFirst = kappaOrder.filter((id) => free.includes(id))
  const rest = free.filter((id) => !kappaSet.has(id))

  for (const id of [...kappaFirst, ...rest]) {
    place(id)
    // Glue weather onto kappa1's day.
    if (id === "201006_kappa1") {
      const companion = "201006_kappa1_weather"
      const host = days.find((d) => d.has(id))
      if (
        host &&
        events.some((e) => e.id === companion) &&
        !alwaysSet.has(companion) &&
        !dayConflicts(companion, host, adj) &&
        !dayConflicts(companion, alwaysSet, adj)
      ) {
        host.add(companion)
      }
    }
  }

  // Drop empty trailing days created only as capacity; keep leading empties unlikely.
  const packed = days.filter((d) => d.size > 0)
  const loopDays: EventScheduleLoopDay[] = packed.map((d) => ({
    id: randomUUID(),
    eventIds: [...d].sort(),
  }))

  return {
    alwaysOnIds,
    days: loopDays,
    skippedIds: [...new Set(skippedIds)].sort(),
    spotGroupCount: spotGroups.length,
    lifecycleGroupCount: lifeGroups.length,
  }
}

export function denseArchiveAsProfile(
  events: CompEvent[],
  nowIso: string = new Date().toISOString()
): EventScheduleLoopProfile {
  const built = buildDenseArchiveCycle(events)
  return {
    id: DENSE_ARCHIVE_PROFILE_ID,
    name: "Dense archive cycle",
    description: DENSE_ARCHIVE_DESCRIPTION,
    builtin: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    alwaysOnIds: built.alwaysOnIds,
    days: built.days,
  }
}
