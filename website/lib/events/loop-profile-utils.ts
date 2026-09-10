import type { EventScheduleLoopDay } from "./types"

export const DENSE_ARCHIVE_PROFILE_ID = "builtin:dense-archive"

export const DENSE_ARCHIVE_DESCRIPTION =
  "Rotates through as much of the event catalog as possible in a short loop. Timing is not seasonal — miss a day and it comes back on the next cycle (about two weeks). Packs many compatible events per day; keeps main/post, shared NPC spots (e.g. Saien), and hard conflicts apart. QoL partials stay always-on."

/** Fresh day ids so applying a profile never collides with editor state. */
export function cloneProfileDays(
  days: EventScheduleLoopDay[]
): EventScheduleLoopDay[] {
  return days.map((d) => ({
    id: crypto.randomUUID(),
    eventIds: [...d.eventIds],
  }))
}
