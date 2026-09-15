import { promises as fs } from "node:fs"
import path from "node:path"

/**
 * Baked catalog / i18n / conflict seeds — replaced with each website image.
 * Mutable Admin schedule state must NOT live here (see eventsDataDir).
 */
export function eventsImageContentDir(): string {
  return path.resolve(process.cwd(), "content", "events")
}

/**
 * Persistent Admin Events schedule + profiles + reconciler status.
 * Under WEBSITE_DATA_DIR/events when set (Docker bind mount); otherwise
 * website/data/events for local dev so image content stays seed-only.
 */
export function eventsDataDir(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  if (custom) return path.join(custom, "events")
  return path.resolve(process.cwd(), "data", "events")
}

const MUTABLE_SEED_FILES = [
  "event-schedule.json",
  "event-schedule-profiles.json",
] as const

let seedPromise: Promise<void> | null = null

/**
 * Copy image seeds into the data dir once if missing. Never overwrites an
 * existing file — Admin edits survive website image pulls.
 */
export async function ensureEventsDataSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const dataDir = eventsDataDir()
      const imageDir = eventsImageContentDir()
      await fs.mkdir(dataDir, { recursive: true })
      for (const name of MUTABLE_SEED_FILES) {
        const dest = path.join(dataDir, name)
        try {
          await fs.access(dest)
          continue
        } catch {
          /* missing — try seed */
        }
        const src = path.join(imageDir, name)
        try {
          await fs.copyFile(src, dest)
        } catch (err) {
          const code = (err as NodeJS.ErrnoException)?.code
          if (code !== "ENOENT") {
            console.warn(
              `[EventSchedule] seed copy ${name} failed:`,
              err instanceof Error ? err.message : err
            )
          }
        }
      }
    })().catch((err) => {
      seedPromise = null
      throw err
    })
  }
  await seedPromise
}
