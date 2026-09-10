import { promises as fs } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { denseArchiveAsProfile } from "./dense-archive-cycle"
import { getEventsCatalog } from "./events-fs"
import { normalizeIds } from "./event-schedule-math"
import type {
  EventScheduleLoopDay,
  EventScheduleLoopProfile,
  EventScheduleProfilesFile,
} from "./types"

function eventsContentDir(): string {
  return path.resolve(process.cwd(), "content", "events")
}

function profilesPath(): string {
  return path.join(eventsContentDir(), "event-schedule-profiles.json")
}

export const PROFILES_PATH = path.resolve(
  process.cwd(),
  "content",
  "events",
  "event-schedule-profiles.json"
)

function emptyFile(): EventScheduleProfilesFile {
  return { version: 1, profiles: [] }
}

function isProfile(raw: unknown): raw is EventScheduleLoopProfile {
  if (!raw || typeof raw !== "object") return false
  const o = raw as Record<string, unknown>
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.description === "string" &&
    typeof o.builtin === "boolean" &&
    Array.isArray(o.alwaysOnIds) &&
    Array.isArray(o.days)
  )
}

async function readUserFile(): Promise<EventScheduleProfilesFile> {
  try {
    const raw = await fs.readFile(profilesPath(), "utf8")
    const parsed = JSON.parse(raw) as EventScheduleProfilesFile
    if (parsed?.version !== 1 || !Array.isArray(parsed.profiles)) {
      return emptyFile()
    }
    return {
      version: 1,
      profiles: parsed.profiles.filter(
        (p) => isProfile(p) && !p.builtin && !p.id.startsWith("builtin:")
      ),
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === "ENOENT") return emptyFile()
    throw err
  }
}

async function writeUserFile(file: EventScheduleProfilesFile): Promise<void> {
  await fs.mkdir(eventsContentDir(), { recursive: true })
  const normalized: EventScheduleProfilesFile = {
    version: 1,
    profiles: file.profiles.map((p) => ({
      ...p,
      builtin: false,
      alwaysOnIds: normalizeIds(p.alwaysOnIds ?? []),
      days: (p.days ?? []).map((d) => ({
        id: d.id || randomUUID(),
        eventIds: normalizeIds(d.eventIds ?? []),
      })),
    })),
  }
  await fs.writeFile(
    profilesPath(),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  )
}

export async function listLoopProfiles(): Promise<EventScheduleLoopProfile[]> {
  const catalog = await getEventsCatalog()
  const dense = denseArchiveAsProfile(catalog.events)
  const user = await readUserFile()
  return [dense, ...user.profiles]
}

export async function getLoopProfile(
  id: string
): Promise<EventScheduleLoopProfile | null> {
  const all = await listLoopProfiles()
  return all.find((p) => p.id === id) ?? null
}

export type SaveLoopProfileInput = {
  name: string
  description?: string
  alwaysOnIds: string[]
  days: EventScheduleLoopDay[]
  /** When set, overwrite that user profile (not builtin). */
  id?: string
}

export async function saveLoopProfile(
  input: SaveLoopProfileInput
): Promise<EventScheduleLoopProfile> {
  const name = input.name.trim()
  if (!name) throw new Error("Profile name is required")
  if (input.id?.startsWith("builtin:")) {
    throw new Error("Cannot overwrite a built-in profile — save as a new name")
  }

  const now = new Date().toISOString()
  const file = await readUserFile()
  const days = (input.days ?? []).map((d) => ({
    id: d.id || randomUUID(),
    eventIds: normalizeIds(d.eventIds ?? []),
  }))
  const alwaysOnIds = normalizeIds(input.alwaysOnIds ?? [])
  const description = (input.description ?? "").trim()

  if (input.id) {
    const idx = file.profiles.findIndex((p) => p.id === input.id)
    if (idx < 0) throw new Error("Profile not found")
    const prev = file.profiles[idx]!
    const next: EventScheduleLoopProfile = {
      ...prev,
      name,
      description,
      updatedAt: now,
      alwaysOnIds,
      days,
      builtin: false,
    }
    file.profiles[idx] = next
    await writeUserFile(file)
    return next
  }

  const created: EventScheduleLoopProfile = {
    id: randomUUID(),
    name,
    description,
    builtin: false,
    createdAt: now,
    updatedAt: now,
    alwaysOnIds,
    days,
  }
  file.profiles.push(created)
  await writeUserFile(file)
  return created
}

export async function deleteLoopProfile(id: string): Promise<void> {
  if (id.startsWith("builtin:")) {
    throw new Error("Cannot delete a built-in profile")
  }
  const file = await readUserFile()
  const next = file.profiles.filter((p) => p.id !== id)
  if (next.length === file.profiles.length) {
    throw new Error("Profile not found")
  }
  await writeUserFile({ version: 1, profiles: next })
}
