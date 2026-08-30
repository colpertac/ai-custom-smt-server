import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import {
  appearanceFingerprint,
  portraitFingerprintCanonical,
  portraitsDir,
  type PortraitFingerprintInput,
} from "./armory-portrait.ts"

export const PORTRAIT_CLAIM_TIMEOUT_MS = 15 * 60 * 1000

export type PortraitJobStatus = "pending" | "claimed" | "ready" | "failed"

export type PortraitJobPayload = PortraitFingerprintInput & {
  fingerprint: string
  characterName: string
  canonical: string
}

export type PortraitJob = {
  fingerprint: string
  characterName: string
  status: PortraitJobStatus
  payload: PortraitJobPayload
  claimedAt: number | null
  error: string | null
  createdAt: number
  updatedAt: number
}

function dbPath(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "portraits.db")
}

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS portrait_jobs (
      fingerprint TEXT PRIMARY KEY,
      character_name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      claimed_at INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_portrait_jobs_status_created
      ON portrait_jobs(status, created_at);
  `)
  return db
}

type JobRow = {
  fingerprint: string
  character_name: string
  payload_json: string
  status: string
  claimed_at: number | null
  error: string | null
  created_at: number
  updated_at: number
}

function parsePayload(json: string): PortraitJobPayload {
  return JSON.parse(json) as PortraitJobPayload
}

function rowToJob(row: JobRow): PortraitJob {
  return {
    fingerprint: row.fingerprint,
    characterName: row.character_name,
    status: row.status as PortraitJobStatus,
    payload: parsePayload(row.payload_json),
    claimedAt: row.claimed_at,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function buildPortraitJobPayload(
  characterName: string,
  input: PortraitFingerprintInput
): PortraitJobPayload {
  const fingerprint = appearanceFingerprint(input)
  return {
    ...input,
    fingerprint,
    characterName,
    canonical: portraitFingerprintCanonical(input),
  }
}

/**
 * Insert or refresh a pending capture job. Existing pending/claimed rows
 * keep their status (payload is updated). ready/failed rows retry as pending.
 */
export function enqueuePortraitJob(
  characterName: string,
  input: PortraitFingerprintInput,
  now = Date.now()
): { fingerprint: string; status: PortraitJobStatus } {
  const payload = buildPortraitJobPayload(characterName, input)
  const json = JSON.stringify(payload)
  const database = getDb()
  database
    .prepare(
      `INSERT INTO portrait_jobs (
         fingerprint, character_name, payload_json, status,
         claimed_at, error, created_at, updated_at
       ) VALUES (?, ?, ?, 'pending', NULL, NULL, ?, ?)
       ON CONFLICT(fingerprint) DO UPDATE SET
         character_name = excluded.character_name,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at,
         status = CASE
           WHEN portrait_jobs.status IN ('pending', 'claimed') THEN portrait_jobs.status
           ELSE 'pending'
         END,
         claimed_at = CASE
           WHEN portrait_jobs.status = 'claimed' THEN portrait_jobs.claimed_at
           ELSE NULL
         END,
         error = CASE
           WHEN portrait_jobs.status IN ('pending', 'claimed') THEN portrait_jobs.error
           ELSE NULL
         END`
    )
    .run(payload.fingerprint, characterName, json, now, now)

  const row = database
    .prepare(`SELECT status FROM portrait_jobs WHERE fingerprint = ?`)
    .get(payload.fingerprint) as { status: PortraitJobStatus }

  return { fingerprint: payload.fingerprint, status: row.status }
}

/** One job at a time. Returns the in-flight claim, or the oldest pending. */
export function claimPortraitJob(now = Date.now()): PortraitJob | null {
  const database = getDb()
  const staleBefore = now - PORTRAIT_CLAIM_TIMEOUT_MS

  database.exec("BEGIN IMMEDIATE")
  try {
    database
      .prepare(
        `UPDATE portrait_jobs
         SET status = 'pending', claimed_at = NULL, updated_at = ?
         WHERE status = 'claimed' AND (claimed_at IS NULL OR claimed_at <= ?)`
      )
      .run(now, staleBefore)

    const inflight = database
      .prepare(
        `SELECT * FROM portrait_jobs
         WHERE status = 'claimed'
         ORDER BY claimed_at ASC
         LIMIT 1`
      )
      .get() as JobRow | undefined
    if (inflight) {
      database.exec("COMMIT")
      return rowToJob(inflight)
    }

    const next = database
      .prepare(
        `SELECT * FROM portrait_jobs
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get() as JobRow | undefined
    if (!next) {
      database.exec("COMMIT")
      return null
    }

    database
      .prepare(
        `UPDATE portrait_jobs
         SET status = 'claimed', claimed_at = ?, updated_at = ?
         WHERE fingerprint = ?`
      )
      .run(now, now, next.fingerprint)
    database.exec("COMMIT")
    return rowToJob({
      ...next,
      status: "claimed",
      claimed_at: now,
      updated_at: now,
    })
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}

function hashedPortraitExists(fingerprint: string): boolean {
  const dir = portraitsDir()
  return (
    fs.existsSync(path.join(dir, `${fingerprint}.webp`)) ||
    fs.existsSync(path.join(dir, `${fingerprint}.png`))
  )
}

export function completePortraitJob(
  fingerprint: string,
  now = Date.now()
): PortraitJob {
  if (!hashedPortraitExists(fingerprint)) {
    throw new Error(
      `No portraits/${fingerprint}.png|.webp — write the capture before completing`
    )
  }
  return setJobStatus(fingerprint, "ready", null, now)
}

export function failPortraitJob(
  fingerprint: string,
  error: string,
  now = Date.now()
): PortraitJob {
  return setJobStatus(fingerprint, "failed", error, now)
}

function setJobStatus(
  fingerprint: string,
  status: PortraitJobStatus,
  error: string | null,
  now: number
): PortraitJob {
  const database = getDb()
  const result = database
    .prepare(
      `UPDATE portrait_jobs
       SET status = ?, error = ?, claimed_at = NULL, updated_at = ?
       WHERE fingerprint = ?`
    )
    .run(status, error, now, fingerprint)
  if (result.changes === 0) {
    throw new Error(`Unknown portrait job ${fingerprint}`)
  }
  const row = database
    .prepare(`SELECT * FROM portrait_jobs WHERE fingerprint = ?`)
    .get(fingerprint) as JobRow
  return rowToJob(row)
}

export function getPortraitJob(fingerprint: string): PortraitJob | null {
  const row = getDb()
    .prepare(`SELECT * FROM portrait_jobs WHERE fingerprint = ?`)
    .get(fingerprint) as JobRow | undefined
  return row ? rowToJob(row) : null
}

export function listPortraitJobs(status?: PortraitJobStatus): PortraitJob[] {
  const database = getDb()
  const rows = (
    status
      ? database
          .prepare(
            `SELECT * FROM portrait_jobs WHERE status = ? ORDER BY created_at ASC`
          )
          .all(status)
      : database
          .prepare(`SELECT * FROM portrait_jobs ORDER BY created_at ASC`)
          .all()
  ) as JobRow[]
  return rows.map(rowToJob)
}

/** Copy-paste GM lines for a human-operated first capture. */
export function gmDressCommands(payload: PortraitJobPayload): string[] {
  const lines = [
    `# ${payload.characterName}  ${payload.fingerprint}`,
    `# do not dress live cat/catm — mannequin only`,
    `@zone 10105`,
    `@pos 50000 50000`,
    `@va clear`,
  ]
  for (const entry of [...payload.equippedVA].sort((a, b) => a.slot - b.slot)) {
    lines.push(`@va ${entry.slot} ${entry.itemType}`)
  }
  if (payload.weaponType) {
    lines.push(`# dummy weapon Type ${payload.weaponType} in slot 13 (match VA subCategory)`)
  }
  lines.push(`# tap W if demon faces away, then hold S ~2s`)
  return lines
}

export function resetPortraitQueueForTests(): void {
  if (db) {
    db.close()
    db = null
  }
  const file = dbPath()
  if (fs.existsSync(file)) fs.unlinkSync(file)
}
