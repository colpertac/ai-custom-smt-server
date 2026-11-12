import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite.ts"

import { portraitsDir } from "./armory-portrait.ts"
import type { AvatarRecipe } from "./avatar-recipe.ts"
import {
  portraitFingerprintV3,
  portraitFingerprintV3Canonical,
} from "./portrait-fingerprint-v3.ts"
import {
  RENDER_WORKER_FRESH_MS,
  RENDERER_VERSION,
  THREE_PORTRAIT_HEIGHT,
  THREE_PORTRAIT_PRESET,
  THREE_PORTRAIT_WIDTH,
} from "./portrait-renderer.ts"

export const PORTRAIT_CLAIM_TIMEOUT_MS = 15 * 60 * 1000
/** After a failed capture, ignore armory re-enqueue until this elapses. */
export const PORTRAIT_FAIL_RETRY_MS = 60 * 1000

export type PortraitJobStatus = "pending" | "claimed" | "ready" | "failed"

/** Render worker job (v3 fingerprint): the resolved avatar recipe. */
export type PortraitJobPayload = {
  fingerprint: string
  characterName: string
  canonical: string
  recipe: AvatarRecipe
  catalogVersion: number
  rendererVersion: number
  preset: typeof THREE_PORTRAIT_PRESET
  width: number
  height: number
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

function openPortraitDb(): DatabaseSync {
  const database = new DatabaseSync(dbPath())
  database.exec(`
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
    CREATE TABLE IF NOT EXISTS portrait_workers (
      worker_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      renderer_version INTEGER,
      assets_version TEXT,
      chrome TEXT,
      busy INTEGER NOT NULL DEFAULT 0,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
  `)
  return database
}

function getDb(): DatabaseSync {
  if (db) return db
  db = openPortraitDb()
  return db
}

/** Drop cached handle (e.g. after clear unlinked the file while Next still ran). */
export function reopenPortraitDb(): void {
  if (db) {
    try {
      db.close()
    } catch {
      /* already closed / deleted inode */
    }
    db = null
  }
  db = openPortraitDb()
}

function isReadonlyDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /readonly database/i.test(msg)
}

/** Run a write; if the handle is stale (deleted inode), reopen once and retry. */
function withPortraitDbWrite<T>(fn: (database: DatabaseSync) => T): T {
  try {
    return fn(getDb())
  } catch (err) {
    if (!isReadonlyDbError(err)) throw err
    reopenPortraitDb()
    return fn(getDb())
  }
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

export function buildPortraitRecipeJobPayload(
  characterName: string,
  recipe: AvatarRecipe,
  catalogVersion: number
): PortraitJobPayload {
  return {
    fingerprint: portraitFingerprintV3(recipe, catalogVersion),
    characterName,
    canonical: portraitFingerprintV3Canonical(recipe, catalogVersion),
    recipe,
    catalogVersion,
    rendererVersion: RENDERER_VERSION,
    preset: THREE_PORTRAIT_PRESET,
    width: THREE_PORTRAIT_WIDTH,
    height: THREE_PORTRAIT_HEIGHT,
  }
}

/**
 * Insert or refresh a pending render job (v3 fingerprint, payload carries the recipe).
 * Existing pending/claimed rows keep their status (payload is updated); ready/failed rows retry
 * as pending, except a failure younger than PORTRAIT_FAIL_RETRY_MS.
 */
export function enqueuePortraitRecipeJob(
  characterName: string,
  recipe: AvatarRecipe,
  catalogVersion: number,
  now = Date.now()
): { fingerprint: string; status: PortraitJobStatus } {
  return upsertPortraitJob(
    buildPortraitRecipeJobPayload(characterName, recipe, catalogVersion),
    now
  )
}

function upsertPortraitJob(
  payload: PortraitJobPayload,
  now: number
): { fingerprint: string; status: PortraitJobStatus } {
  const characterName = payload.characterName
  const json = JSON.stringify(payload)
  return withPortraitDbWrite((database) => {
    database
      .prepare(
        `INSERT INTO portrait_jobs (
           fingerprint, character_name, payload_json, status,
           claimed_at, error, created_at, updated_at
         ) VALUES (?, ?, ?, 'pending', NULL, NULL, ?, ?)
         ON CONFLICT(fingerprint) DO UPDATE SET
           character_name = excluded.character_name,
           payload_json = excluded.payload_json,
           updated_at = CASE
             WHEN portrait_jobs.status = 'failed'
               AND portrait_jobs.updated_at > (excluded.updated_at - ${PORTRAIT_FAIL_RETRY_MS})
               THEN portrait_jobs.updated_at
             ELSE excluded.updated_at
           END,
           status = CASE
             WHEN portrait_jobs.status IN ('pending', 'claimed') THEN portrait_jobs.status
             WHEN portrait_jobs.status = 'failed'
               AND portrait_jobs.updated_at > (excluded.updated_at - ${PORTRAIT_FAIL_RETRY_MS})
               THEN 'failed'
             ELSE 'pending'
           END,
           claimed_at = CASE
             WHEN portrait_jobs.status = 'claimed' THEN portrait_jobs.claimed_at
             ELSE NULL
           END,
           error = CASE
             WHEN portrait_jobs.status IN ('pending', 'claimed') THEN portrait_jobs.error
             WHEN portrait_jobs.status = 'failed'
               AND portrait_jobs.updated_at > (excluded.updated_at - ${PORTRAIT_FAIL_RETRY_MS})
               THEN portrait_jobs.error
             ELSE NULL
           END`
      )
      .run(payload.fingerprint, characterName, json, now, now)

    const row = database
      .prepare(`SELECT status FROM portrait_jobs WHERE fingerprint = ?`)
      .get(payload.fingerprint) as { status: PortraitJobStatus }

    return { fingerprint: payload.fingerprint, status: row.status }
  })
}

/** Jobs the render worker may take: recipe jobs of this site's RENDERER_VERSION. */
const CLAIMABLE_SQL = `json_extract(payload_json, '$.recipe') IS NOT NULL
       AND json_extract(payload_json, '$.rendererVersion') = ${RENDERER_VERSION}`

/**
 * One job at a time. Returns the in-flight claim, or the oldest pending recipe job of the
 * current RENDERER_VERSION. Pending jobs that can never render (an older rendererVersion, or a
 * legacy row without a recipe) are failed instead — their fingerprint is no longer used.
 */
export function claimPortraitJob(now = Date.now()): PortraitJob | null {
  const filter = CLAIMABLE_SQL
  return withPortraitDbWrite((database) => {
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

      database
        .prepare(
          `UPDATE portrait_jobs
           SET status = 'failed', claimed_at = NULL, updated_at = ?,
               error = 'stale rendererVersion (site is ${RENDERER_VERSION})'
           WHERE status = 'pending'
             AND json_extract(payload_json, '$.recipe') IS NOT NULL
             AND coalesce(json_extract(payload_json, '$.rendererVersion'), -1)
                 != ${RENDERER_VERSION}`
        )
        .run(now)
      database
        .prepare(
          `UPDATE portrait_jobs
           SET status = 'failed', claimed_at = NULL, updated_at = ?,
               error = 'legacy job without an avatar recipe'
           WHERE status IN ('pending', 'claimed')
             AND json_extract(payload_json, '$.recipe') IS NULL`
        )
        .run(now)

      const inflight = database
        .prepare(
          `SELECT * FROM portrait_jobs
           WHERE status = 'claimed' AND ${filter}
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
           WHERE status = 'pending' AND ${filter}
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
      try {
        database.exec("ROLLBACK")
      } catch {
        /* ignore */
      }
      throw error
    }
  })
}

export type PortraitWorkerHeartbeat = {
  workerId: string
  kind: string
  rendererVersion: number | null
  assetsVersion: string | null
  chrome: string | null
  busy: boolean
  firstSeen: number
  lastSeen: number
}

type WorkerRow = {
  worker_id: string
  kind: string
  renderer_version: number | null
  assets_version: string | null
  chrome: string | null
  busy: number
  first_seen: number
  last_seen: number
}

/** Heartbeats older than this are pruned on the next heartbeat. */
const WORKER_HEARTBEAT_KEEP_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Upsert a render worker's heartbeat (portraits.db, so it survives restarts and is shared by
 * every Next worker process).
 */
export function recordPortraitWorkerHeartbeat(
  input: {
    workerId: string
    kind: string
    rendererVersion: number | null
    assetsVersion: string | null
    chrome: string | null
    busy: boolean
  },
  now = Date.now()
): PortraitWorkerHeartbeat {
  return withPortraitDbWrite((database) => {
    database
      .prepare(
        `INSERT INTO portrait_workers (
           worker_id, kind, renderer_version, assets_version, chrome, busy,
           first_seen, last_seen
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(worker_id) DO UPDATE SET
           kind = excluded.kind,
           renderer_version = excluded.renderer_version,
           assets_version = excluded.assets_version,
           chrome = excluded.chrome,
           busy = excluded.busy,
           last_seen = excluded.last_seen`
      )
      .run(
        input.workerId,
        input.kind,
        input.rendererVersion,
        input.assetsVersion,
        input.chrome,
        input.busy ? 1 : 0,
        now,
        now
      )
    database
      .prepare(`DELETE FROM portrait_workers WHERE last_seen < ?`)
      .run(now - WORKER_HEARTBEAT_KEEP_MS)
    const row = database
      .prepare(`SELECT * FROM portrait_workers WHERE worker_id = ?`)
      .get(input.workerId) as WorkerRow
    return workerRowToHeartbeat(row)
  })
}

function workerRowToHeartbeat(row: WorkerRow): PortraitWorkerHeartbeat {
  return {
    workerId: row.worker_id,
    kind: row.kind,
    rendererVersion: row.renderer_version,
    assetsVersion: row.assets_version,
    chrome: row.chrome,
    busy: Boolean(row.busy),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  }
}

/** Latest heartbeats first (Admin → Portraits). */
export function listPortraitWorkerHeartbeats(limit = 20): PortraitWorkerHeartbeat[] {
  const rows = getDb()
    .prepare(`SELECT * FROM portrait_workers ORDER BY last_seen DESC LIMIT ?`)
    .all(limit) as WorkerRow[]
  return rows.map(workerRowToHeartbeat)
}

export function getPortraitWorkerHeartbeat(
  workerId: string
): PortraitWorkerHeartbeat | null {
  const row = getDb()
    .prepare(`SELECT * FROM portrait_workers WHERE worker_id = ?`)
    .get(workerId) as WorkerRow | undefined
  return row ? workerRowToHeartbeat(row) : null
}

/** True when the heartbeat is recent and from a three worker on this site's RENDERER_VERSION. */
export function isPortraitWorkerHeartbeatUsable(
  hb: PortraitWorkerHeartbeat,
  now = Date.now()
): boolean {
  return (
    hb.kind === "three" &&
    hb.rendererVersion === RENDERER_VERSION &&
    now - hb.lastSeen <= RENDER_WORKER_FRESH_MS
  )
}

/** Render availability: a matching render worker sent a heartbeat in the last 60 s. */
export function isRenderWorkerAvailable(now = Date.now()): boolean {
  return listPortraitWorkerHeartbeats().some((hb) =>
    isPortraitWorkerHeartbeatUsable(hb, now)
  )
}

/** Test helper — empty the worker heartbeat table (reopens at the current data dir). */
export function resetPortraitWorkersForTests(): void {
  reopenPortraitDb()
  getDb().exec("DELETE FROM portrait_workers")
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
  return withPortraitDbWrite((database) => {
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
  })
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

/** Copy a PNG onto `portraits/{fingerprint}.png` and mark the job ready (CLI). */
export function ingestPortraitFile(
  srcPath: string,
  fingerprint: string
): { fingerprint: string; url: string } {
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) {
    throw new Error(`Invalid fingerprint '${fingerprint}' (want 16 hex)`)
  }
  const src = path.resolve(srcPath)
  if (!fs.existsSync(src)) {
    throw new Error(`Capture not found: ${src}`)
  }
  return ingestPortraitBytes(fs.readFileSync(src), fingerprint)
}

/** Same as ingestPortraitFile but from an in-memory PNG (render worker upload). */
export function ingestPortraitBytes(
  png: Buffer | Uint8Array,
  fingerprint: string
): { fingerprint: string; url: string } {
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) {
    throw new Error(`Invalid fingerprint '${fingerprint}' (want 16 hex)`)
  }
  if (!png || png.byteLength < 8) {
    throw new Error("Capture is empty or too small")
  }
  // PNG magic
  const b = Buffer.isBuffer(png) ? png : Buffer.from(png)
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) {
    throw new Error("Capture is not a PNG")
  }
  const dir = portraitsDir()
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `${fingerprint}.png`)
  fs.writeFileSync(dest, b)
  const job = getPortraitJob(fingerprint)
  if (job && job.status !== "ready") {
    completePortraitJob(fingerprint)
  }
  return {
    fingerprint,
    url: `/armory/portraits/${fingerprint}.png`,
  }
}

/**
 * Reopen DB at the current path and empty the queue table.
 * Prefer DELETE over unlinking the file — Next.js may still hold an open
 * handle; deleting the inode makes writes fail with "readonly database"
 * until the server restarts.
 */
export function resetPortraitQueueForTests(): void {
  reopenPortraitDb()
  getDb().exec("DELETE FROM portrait_jobs")
}

/**
 * Wipe cached portrait images + queue so armory misses and re-enqueues.
 * Keeps other files (e.g. legacy name-keyed `cat2.png`, no longer served) unless
 * `includeStubs` is true.
 */
export function clearPortraitCache(opts?: {
  includeStubs?: boolean
}): { removedFiles: string[]; queueReset: boolean } {
  const dir = portraitsDir()
  const removedFiles: string[] = []
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      const isHash = /^[0-9a-f]{16}\.(png|webp)$/i.test(name)
      const isStub = /\.(png|webp)$/i.test(name) && !isHash
      if (isHash || (opts?.includeStubs && isStub)) {
        fs.unlinkSync(path.join(dir, name))
        removedFiles.push(name)
      }
    }
  }
  resetPortraitQueueForTests()
  return { removedFiles, queueReset: true }
}

function unlinkPortraitBasename(basename: string): string[] {
  const dir = portraitsDir()
  const removed: string[] = []
  if (!basename.trim() || !fs.existsSync(dir)) return removed
  for (const ext of [".png", ".webp"] as const) {
    const file = `${basename}${ext}`
    const full = path.join(dir, file)
    try {
      if (fs.existsSync(full)) {
        fs.unlinkSync(full)
        removed.push(file)
      }
    } catch {
      /* ignore */
    }
  }
  return removed
}

/**
 * Clear portrait cache + queue rows for one character so `/armory/{name}`
 * shows the placeholder and re-enqueues a render on next visit.
 */
export function clearPortraitForCharacter(
  rawName: string,
  opts?: { extraFingerprints?: string[] }
): {
  characterName: string
  removedFiles: string[]
  removedJobs: number
  fingerprints: string[]
} {
  const characterName = rawName.trim()
  if (!characterName) {
    throw new Error("character name required")
  }

  const db = getDb()
  const rows = db
    .prepare(
      `SELECT fingerprint FROM portrait_jobs
       WHERE lower(character_name) = lower(?)`
    )
    .all(characterName) as { fingerprint: string }[]

  const fingerprints = new Set<string>()
  for (const row of rows) {
    if (row.fingerprint) fingerprints.add(row.fingerprint.toLowerCase())
  }
  for (const fp of opts?.extraFingerprints ?? []) {
    const n = fp.trim().toLowerCase()
    if (/^[0-9a-f]{16}$/.test(n)) fingerprints.add(n)
  }

  const removedFiles: string[] = []
  for (const fp of fingerprints) {
    removedFiles.push(...unlinkPortraitBasename(fp))
  }
  // Legacy name-keyed files (catm.png); no longer served, removed for tidiness.
  removedFiles.push(...unlinkPortraitBasename(characterName))
  if (characterName.toLowerCase() !== characterName) {
    removedFiles.push(...unlinkPortraitBasename(characterName.toLowerCase()))
  }

  let removedJobs = 0
  if (fingerprints.size) {
    const fps = [...fingerprints]
    const placeholders = fps.map(() => "?").join(",")
    const r = db
      .prepare(
        `DELETE FROM portrait_jobs
         WHERE lower(character_name) = lower(?)
            OR fingerprint IN (${placeholders})`
      )
      .run(characterName, ...fps)
    removedJobs = Number(r.changes ?? 0)
  } else {
    const r = db
      .prepare(
        `DELETE FROM portrait_jobs WHERE lower(character_name) = lower(?)`
      )
      .run(characterName)
    removedJobs = Number(r.changes ?? 0)
  }

  return {
    characterName,
    removedFiles: [...new Set(removedFiles)],
    removedJobs,
    fingerprints: [...fingerprints],
  }
}

export type RenderWorkerClaimResult =
  | { versionMismatch: false; job: PortraitJob | null }
  | {
      versionMismatch: true
      job: null
      siteRendererVersion: number
      workerRendererVersion: number | null
      note: string
    }

/**
 * `POST /api/portrait/queue/claim` with `{kind: "three"}`. The worker's renderer version comes
 * from the body (`rendererVersion`), else its last heartbeat (`workerId`), else the newest
 * three heartbeat. A worker on another version (or unknown) gets no job.
 */
export function claimRenderWorkerJob(
  body: { rendererVersion?: unknown; workerId?: unknown },
  now = Date.now()
): RenderWorkerClaimResult {
  let workerVersion: number | null = null
  if (typeof body.rendererVersion === "number" && Number.isFinite(body.rendererVersion)) {
    workerVersion = body.rendererVersion
  } else {
    const workerId = typeof body.workerId === "string" ? body.workerId.trim() : ""
    const hb = workerId
      ? getPortraitWorkerHeartbeat(workerId)
      : (listPortraitWorkerHeartbeats().find((h) => h.kind === "three") ?? null)
    workerVersion = hb?.rendererVersion ?? null
  }
  if (workerVersion !== RENDERER_VERSION) {
    return {
      versionMismatch: true,
      job: null,
      siteRendererVersion: RENDERER_VERSION,
      workerRendererVersion: workerVersion,
      note:
        workerVersion == null
          ? `rendererVersion unknown: send it in the claim body or heartbeat first (site is ${RENDERER_VERSION})`
          : `worker rendererVersion ${workerVersion} != site ${RENDERER_VERSION}; not claiming`,
    }
  }
  return { versionMismatch: false, job: claimPortraitJob(now) }
}
