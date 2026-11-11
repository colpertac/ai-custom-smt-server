/**
 * Concurrent player count history for admin charts (SteamDB-style).
 * Stored in web.sqlite alongside other website data.
 */
import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite.ts"

export type PlayerCountSample = {
  ts: number
  raw: number
  real: number
}

export type PlayerCountPoint = {
  ts: number
  real: number
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function websiteDataDir(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function dbPath(): string {
  return path.join(websiteDataDir(), "web.sqlite")
}

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_count_samples (
      ts INTEGER PRIMARY KEY,
      raw INTEGER NOT NULL,
      real INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_player_count_samples_ts
      ON player_count_samples(ts);
  `)
  return db
}

/** Insert or replace a sample at `ts` (unix ms). */
export function recordSample(sample: PlayerCountSample): void {
  const raw = Math.max(0, Math.floor(sample.raw))
  const real = Math.max(0, Math.floor(sample.real))
  const ts = Math.floor(sample.ts)
  getDb()
    .prepare(
      `INSERT INTO player_count_samples (ts, raw, real)
       VALUES (?, ?, ?)
       ON CONFLICT(ts) DO UPDATE SET raw = excluded.raw, real = excluded.real`
    )
    .run(ts, raw, real)
}

/** Drop samples older than 30 days. Returns deleted row count. */
export function pruneOldSamples(now = Date.now()): number {
  const cutoff = now - RETENTION_MS
  const result = getDb()
    .prepare(`DELETE FROM player_count_samples WHERE ts < ?`)
    .run(cutoff)
  return Number(result.changes ?? 0)
}

/**
 * List samples since `sinceTs` (inclusive).
 * When `bucketSeconds` > 0, average `real` per time bucket (midpoint ts).
 */
export function listSamples(opts: {
  sinceTs: number
  untilTs?: number
  bucketSeconds?: number
}): PlayerCountPoint[] {
  const sinceTs = Math.floor(opts.sinceTs)
  const untilTs = Math.floor(opts.untilTs ?? Date.now())
  const bucketSeconds = opts.bucketSeconds ?? 0

  if (bucketSeconds > 0) {
    const bucketMs = bucketSeconds * 1000
    const rows = getDb()
      .prepare(
        `SELECT
           (ts / ?) * ? AS bucket_start,
           AVG(real) AS real_avg
         FROM player_count_samples
         WHERE ts >= ? AND ts <= ?
         GROUP BY bucket_start
         ORDER BY bucket_start ASC`
      )
      .all(bucketMs, bucketMs, sinceTs, untilTs) as {
      bucket_start: number
      real_avg: number
    }[]

    return rows.map((row) => ({
      ts: Number(row.bucket_start) + Math.floor(bucketMs / 2),
      real: Math.round(Number(row.real_avg)),
    }))
  }

  const rows = getDb()
    .prepare(
      `SELECT ts, real FROM player_count_samples
       WHERE ts >= ? AND ts <= ?
       ORDER BY ts ASC`
    )
    .all(sinceTs, untilTs) as { ts: number; real: number }[]

  return rows.map((row) => ({
    ts: Number(row.ts),
    real: Number(row.real),
  }))
}

/** Latest sample, or null if empty. */
export function latestSample(): PlayerCountSample | null {
  const row = getDb()
    .prepare(
      `SELECT ts, raw, real FROM player_count_samples
       ORDER BY ts DESC LIMIT 1`
    )
    .get() as { ts: number; raw: number; real: number } | undefined
  if (!row) return null
  return {
    ts: Number(row.ts),
    raw: Number(row.raw),
    real: Number(row.real),
  }
}

/** Test helper — close module DB handle. */
export function resetPlayerCountStoreForTests(): void {
  if (db) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
  db = null
}
