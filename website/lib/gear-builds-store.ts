import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite.ts"
import {
  summarizePlannerCombat,
  type PlannerCombatSummary,
  type PlannerStatKey,
  type PlannerStoredState,
} from "@/lib/gear-planner-combat"

export type GearBuildRow = {
  id: string
  username: string
  name: string
  payload: PlannerStoredState
  shareToken: string | null
  isPublished: boolean
  publishedAt: number | null
  likeCount: number
  gender: 0 | 1 | null
  combatSummary: PlannerCombatSummary | null
  updatedAt: number
  createdAt: number
}

export type GearBuildPublicSummary = {
  id: string
  name: string
  username: string
  shareToken: string
  updatedAt: number
  publishedAt: number
  likeCount: number
  gender: 0 | 1 | null
  payload: PlannerStoredState
  combatSummary: PlannerCombatSummary | null
}

export type PublishedListSort = "newest" | "liked"

export type PublishedCapFilter =
  | "lbc"
  | "tac"
  | "pc"
  | "incant"
  | "cooldown"
  | "pp"

const CAP_KEY_MAP: Record<PublishedCapFilter, PlannerStatKey> = {
  lbc: "lbc",
  tac: "tac",
  pc: "pc",
  incant: "incant",
  cooldown: "cooldown",
  pp: "pp",
}

function dbPath(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "web.sqlite")
}

let db: DatabaseSync | null = null

function parseCombatJson(raw: string | null | undefined): PlannerCombatSummary | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as PlannerCombatSummary
  } catch {
    return null
  }
}

function migrateGearBuilds(database: DatabaseSync): void {
  const cols = database
    .prepare(`PRAGMA table_info(gear_builds)`)
    .all() as Array<{ name: string }>
  const names = new Set(cols.map((c) => c.name))
  if (!names.has("is_published")) {
    database.exec(
      `ALTER TABLE gear_builds ADD COLUMN is_published INTEGER NOT NULL DEFAULT 0`
    )
  }
  if (!names.has("published_at")) {
    database.exec(`ALTER TABLE gear_builds ADD COLUMN published_at INTEGER`)
  }
  if (!names.has("like_count")) {
    database.exec(
      `ALTER TABLE gear_builds ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0`
    )
  }
  if (!names.has("gender")) {
    database.exec(`ALTER TABLE gear_builds ADD COLUMN gender INTEGER`)
  }
  if (!names.has("combat_json")) {
    database.exec(`ALTER TABLE gear_builds ADD COLUMN combat_json TEXT`)
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_gear_builds_published
      ON gear_builds(is_published, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gear_builds_likes
      ON gear_builds(is_published, like_count DESC);
    CREATE TABLE IF NOT EXISTS gear_build_likes (
      build_id TEXT NOT NULL,
      username TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (build_id, username)
    );
    CREATE INDEX IF NOT EXISTS idx_gear_build_likes_build
      ON gear_build_likes(build_id);
  `)

  // Backfill gender + combat cache for published rows missing combat_json.
  const stale = database
    .prepare(
      `SELECT id, payload_json FROM gear_builds
       WHERE is_published = 1
         AND (combat_json IS NULL OR combat_json = '' OR gender IS NULL)`
    )
    .all() as Array<{ id: string; payload_json: string }>
  const updateCache = database.prepare(
    `UPDATE gear_builds SET gender = ?, combat_json = ? WHERE id = ?`
  )
  for (const row of stale) {
    try {
      const payload = JSON.parse(row.payload_json) as PlannerStoredState
      const summary = summarizePlannerCombat(payload)
      updateCache.run(summary.gender, JSON.stringify(summary), row.id)
    } catch {
      /* skip corrupt payload */
    }
  }
}

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS gear_builds (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      share_token TEXT UNIQUE,
      is_published INTEGER NOT NULL DEFAULT 0,
      published_at INTEGER,
      like_count INTEGER NOT NULL DEFAULT 0,
      gender INTEGER,
      combat_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gear_builds_user ON gear_builds(username);
    CREATE INDEX IF NOT EXISTS idx_gear_builds_share ON gear_builds(share_token);
  `)
  migrateGearBuilds(db)
  return db
}

function newId(): string {
  return randomBytes(12).toString("hex")
}

function newShareToken(): string {
  return randomBytes(16).toString("hex")
}

type DbRow = {
  id: string
  username: string
  name: string
  payload_json: string
  share_token: string | null
  is_published: number | null
  published_at: number | null
  like_count: number | null
  gender: number | null
  combat_json: string | null
  created_at: number
  updated_at: number
}

const SELECT_COLS = `id, username, name, payload_json, share_token,
       COALESCE(is_published, 0) AS is_published, published_at,
       COALESCE(like_count, 0) AS like_count, gender, combat_json,
       created_at, updated_at`

function rowToBuild(row: DbRow): GearBuildRow {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    payload: JSON.parse(row.payload_json) as PlannerStoredState,
    shareToken: row.share_token,
    isPublished: Number(row.is_published ?? 0) === 1,
    publishedAt: row.published_at ?? null,
    likeCount: Number(row.like_count ?? 0),
    gender: row.gender === 0 || row.gender === 1 ? row.gender : null,
    combatSummary: parseCombatJson(row.combat_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function refreshCombatCache(id: string, payload: PlannerStoredState): void {
  const summary = summarizePlannerCombat(payload)
  getDb()
    .prepare(`UPDATE gear_builds SET gender = ?, combat_json = ? WHERE id = ?`)
    .run(summary.gender, JSON.stringify(summary), id)
}

function syncLikeCount(buildId: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM gear_build_likes WHERE build_id = ?`)
    .get(buildId) as { c: number }
  const count = Number(row?.c ?? 0)
  getDb()
    .prepare(`UPDATE gear_builds SET like_count = ? WHERE id = ?`)
    .run(count, buildId)
  return count
}

export function listGearBuilds(username: string): GearBuildRow[] {
  const normalized = username.toLowerCase()
  const rows = getDb()
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM gear_builds WHERE username = ? ORDER BY updated_at DESC`
    )
    .all(normalized) as DbRow[]
  return rows.map(rowToBuild)
}

export type PublishedMinStats = Partial<Record<PlannerStatKey, number>>

export type PublishedMaxReductions = {
  incant?: number
  cooldown?: number
}

type CombatListFilters = {
  caps: PublishedCapFilter[]
  minStats: PublishedMinStats
  maxReductions: PublishedMaxReductions
  minLevel: number | null
}

function hasCombatHardFilters(filters: CombatListFilters): boolean {
  return (
    filters.caps.length > 0 ||
    Object.keys(filters.minStats).length > 0 ||
    filters.maxReductions.incant != null ||
    filters.maxReductions.cooldown != null ||
    filters.minLevel != null
  )
}

function bonusRaw(
  summary: PlannerCombatSummary,
  key: PlannerStatKey
): number | null {
  const bonus = summary.bonuses.find((b) => b.key === key)
  return bonus == null ? null : bonus.raw
}

function combatPassesFilters(
  summary: PlannerCombatSummary | null,
  filters: CombatListFilters
): boolean {
  const hard = hasCombatHardFilters(filters)
  if (!summary) return !hard

  for (const cap of filters.caps) {
    const key = CAP_KEY_MAP[cap]
    const bonus = summary.bonuses.find((b) => b.key === key)
    if (!bonus?.atCap) return false
  }

  for (const [key, min] of Object.entries(filters.minStats) as Array<
    [PlannerStatKey, number]
  >) {
    const raw = bonusRaw(summary, key)
    if (raw == null || raw < min) return false
  }

  if (filters.maxReductions.incant != null) {
    const raw = bonusRaw(summary, "incant")
    if (raw == null || raw > filters.maxReductions.incant) return false
  }
  if (filters.maxReductions.cooldown != null) {
    const raw = bonusRaw(summary, "cooldown")
    if (raw == null || raw > filters.maxReductions.cooldown) return false
  }

  if (filters.minLevel != null && summary.level < filters.minLevel) {
    return false
  }

  return true
}

/** Higher is better. Reduction stats use 100 - raw so lower remaining ranks up. */
function prioritizeScore(
  summary: PlannerCombatSummary | null,
  keys: PlannerStatKey[]
): number {
  if (!summary || keys.length === 0) return 0
  let score = 0
  for (const key of keys) {
    const raw = bonusRaw(summary, key)
    if (raw == null) continue
    if (key === "incant" || key === "cooldown") {
      score += 100 - raw
    } else {
      score += raw
    }
  }
  return score
}

function normalizeMinStats(
  minStats: PublishedMinStats | undefined,
  minLbCap: number | null | undefined
): PublishedMinStats {
  const out: PublishedMinStats = { ...(minStats ?? {}) }
  if (minLbCap != null && Number.isFinite(minLbCap)) {
    const n = Math.max(0, Math.floor(minLbCap))
    out.lbCap = out.lbCap != null ? Math.max(out.lbCap, n) : n
  }
  for (const key of Object.keys(out) as PlannerStatKey[]) {
    const v = out[key]
    if (v == null || !Number.isFinite(v)) {
      delete out[key]
      continue
    }
    out[key] = Math.floor(v)
  }
  return out
}

function normalizeMaxReductions(
  maxReductions: PublishedMaxReductions | undefined
): PublishedMaxReductions {
  const out: PublishedMaxReductions = {}
  if (
    maxReductions?.incant != null &&
    Number.isFinite(maxReductions.incant)
  ) {
    out.incant = Math.floor(maxReductions.incant)
  }
  if (
    maxReductions?.cooldown != null &&
    Number.isFinite(maxReductions.cooldown)
  ) {
    out.cooldown = Math.floor(maxReductions.cooldown)
  }
  return out
}

export function listPublishedGearBuilds(options?: {
  limit?: number
  offset?: number
  q?: string
  gender?: "male" | "female"
  sort?: PublishedListSort
  caps?: PublishedCapFilter[]
  /** @deprecated Prefer minStats.lbCap; still accepted. */
  minLbCap?: number | null
  minStats?: PublishedMinStats
  maxReductions?: PublishedMaxReductions
  prioritize?: PlannerStatKey[]
  minLikes?: number | null
  minLevel?: number | null
}): { builds: GearBuildPublicSummary[]; total: number } {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100)
  const offset = Math.max(options?.offset ?? 0, 0)
  const q = options?.q?.trim().toLowerCase() ?? ""
  const sort: PublishedListSort = options?.sort === "liked" ? "liked" : "newest"
  const caps = options?.caps ?? []
  const minStats = normalizeMinStats(options?.minStats, options?.minLbCap)
  const maxReductions = normalizeMaxReductions(options?.maxReductions)
  const prioritize = (options?.prioritize ?? []).filter(
    (k, i, arr) => arr.indexOf(k) === i
  )
  const minLikes =
    options?.minLikes != null && Number.isFinite(options.minLikes)
      ? Math.max(0, Math.floor(options.minLikes))
      : null
  const minLevel =
    options?.minLevel != null && Number.isFinite(options.minLevel)
      ? Math.max(1, Math.floor(options.minLevel))
      : null
  const combatFilters: CombatListFilters = {
    caps,
    minStats,
    maxReductions,
    minLevel,
  }
  const genderValue =
    options?.gender === "male" ? 0 : options?.gender === "female" ? 1 : null

  const where: string[] = [
    "is_published = 1",
    "share_token IS NOT NULL",
  ]
  const params: Array<string | number> = []

  if (q) {
    where.push("LOWER(name) LIKE ?")
    params.push(`%${q}%`)
  }
  if (genderValue != null) {
    where.push("gender = ?")
    params.push(genderValue)
  }
  if (minLikes != null) {
    where.push("COALESCE(like_count, 0) >= ?")
    params.push(minLikes)
  }

  const whereSql = where.join(" AND ")
  const orderSql =
    sort === "liked"
      ? "ORDER BY COALESCE(like_count, 0) DESC, COALESCE(published_at, updated_at) DESC"
      : "ORDER BY COALESCE(published_at, updated_at) DESC"

  const database = getDb()
  const needsMem =
    prioritize.length > 0 || hasCombatHardFilters(combatFilters)

  // When combat filters / prioritize are active, pull a wider candidate set
  // then filter + score + page in memory.
  const fetchLimit = needsMem ? 500 : limit
  const fetchOffset = needsMem ? 0 : offset

  const rows = database
    .prepare(
      `SELECT id, username, name, payload_json, share_token, updated_at, published_at,
              COALESCE(like_count, 0) AS like_count, gender, combat_json
       FROM gear_builds
       WHERE ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`
    )
    .all(...params, fetchLimit, fetchOffset) as Array<{
    id: string
    username: string
    name: string
    payload_json: string
    share_token: string
    updated_at: number
    published_at: number | null
    like_count: number
    gender: number | null
    combat_json: string | null
  }>

  const mapped: GearBuildPublicSummary[] = []
  for (const r of rows) {
    const payload = JSON.parse(r.payload_json) as PlannerStoredState
    let combatSummary = parseCombatJson(r.combat_json)
    if (!combatSummary) {
      combatSummary = summarizePlannerCombat(payload)
    }
    if (!combatPassesFilters(combatSummary, combatFilters)) continue
    mapped.push({
      id: r.id,
      name: r.name,
      username: r.username,
      shareToken: r.share_token,
      updatedAt: r.updated_at,
      publishedAt: r.published_at ?? r.updated_at,
      likeCount: Number(r.like_count ?? 0),
      gender: r.gender === 0 || r.gender === 1 ? r.gender : combatSummary.gender,
      payload,
      combatSummary,
    })
  }

  if (prioritize.length > 0) {
    mapped.sort((a, b) => {
      const scoreDiff =
        prioritizeScore(b.combatSummary, prioritize) -
        prioritizeScore(a.combatSummary, prioritize)
      if (scoreDiff !== 0) return scoreDiff
      if (sort === "liked") {
        const likeDiff = b.likeCount - a.likeCount
        if (likeDiff !== 0) return likeDiff
      }
      return b.publishedAt - a.publishedAt
    })
  }

  if (!needsMem) {
    const totalRow = database
      .prepare(`SELECT COUNT(*) AS c FROM gear_builds WHERE ${whereSql}`)
      .get(...params) as { c: number }
    return { total: Number(totalRow?.c ?? 0), builds: mapped }
  }

  const total = mapped.length
  const page = mapped.slice(offset, offset + limit)
  return { total, builds: page }
}

export function getGearBuild(
  id: string,
  username?: string
): GearBuildRow | null {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM gear_builds WHERE id = ?`)
    .get(id) as DbRow | undefined
  if (!row) return null
  if (username && row.username !== username.toLowerCase()) return null
  return rowToBuild(row)
}

export function getGearBuildByShareToken(token: string): GearBuildRow | null {
  if (!token || token.length < 16) return null
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM gear_builds WHERE share_token = ?`)
    .get(token) as DbRow | undefined
  return row ? rowToBuild(row) : null
}

export function createGearBuild(options: {
  username: string
  name: string
  payload: PlannerStoredState
}): GearBuildRow {
  const id = newId()
  const now = Date.now()
  const username = options.username.toLowerCase()
  const name = options.name.trim() || "Untitled build"
  getDb()
    .prepare(
      `INSERT INTO gear_builds (
         id, username, name, payload_json, share_token,
         is_published, published_at, like_count, gender, combat_json,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, 0, NULL, 0, NULL, NULL, ?, ?)`
    )
    .run(id, username, name, JSON.stringify(options.payload), now, now)
  return getGearBuild(id)!
}

export function updateGearBuild(options: {
  id: string
  username: string
  name?: string
  payload?: PlannerStoredState
}): GearBuildRow | null {
  const existing = getGearBuild(options.id, options.username)
  if (!existing) return null
  const name =
    options.name != null
      ? options.name.trim() || existing.name
      : existing.name
  const payload = options.payload ?? existing.payload
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE gear_builds SET name = ?, payload_json = ?, updated_at = ?
       WHERE id = ? AND username = ?`
    )
    .run(
      name,
      JSON.stringify(payload),
      now,
      options.id,
      options.username.toLowerCase()
    )
  if (existing.isPublished) {
    refreshCombatCache(options.id, payload)
  }
  return getGearBuild(options.id)!
}

export function deleteGearBuild(id: string, username: string): boolean {
  const existing = getGearBuild(id, username)
  if (!existing) return false
  const database = getDb()
  database.prepare(`DELETE FROM gear_build_likes WHERE build_id = ?`).run(id)
  const result = database
    .prepare(`DELETE FROM gear_builds WHERE id = ? AND username = ?`)
    .run(id, username.toLowerCase())
  return Number(result.changes ?? 0) > 0
}

export function ensureGearBuildShareToken(
  id: string,
  username: string
): { build: GearBuildRow; token: string } | null {
  const existing = getGearBuild(id, username)
  if (!existing) return null
  if (existing.shareToken) {
    return { build: existing, token: existing.shareToken }
  }
  const token = newShareToken()
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE gear_builds SET share_token = ?, updated_at = ?
       WHERE id = ? AND username = ?`
    )
    .run(token, now, id, username.toLowerCase())
  const build = getGearBuild(id)!
  return { build, token }
}

export function setGearBuildPublished(
  id: string,
  username: string,
  published: boolean
): GearBuildRow | null {
  const ensured = ensureGearBuildShareToken(id, username)
  if (!ensured) return null
  const now = Date.now()
  if (published) {
    getDb()
      .prepare(
        `UPDATE gear_builds
         SET is_published = 1,
             published_at = COALESCE(published_at, ?),
             updated_at = ?
         WHERE id = ? AND username = ?`
      )
      .run(now, now, id, username.toLowerCase())
    const build = getGearBuild(id)!
    refreshCombatCache(id, build.payload)
  } else {
    getDb()
      .prepare(
        `UPDATE gear_builds
         SET is_published = 0, published_at = NULL, updated_at = ?
         WHERE id = ? AND username = ?`
      )
      .run(now, id, username.toLowerCase())
  }
  return getGearBuild(id)!
}

export function cloneGearBuildFromShareToken(options: {
  token: string
  username: string
}): GearBuildRow | null {
  const source = getGearBuildByShareToken(options.token)
  if (!source) return null
  const baseName = source.name.trim() || "Untitled build"
  const copyName = `${baseName} (copy)`.slice(0, 120)
  return createGearBuild({
    username: options.username,
    name: copyName,
    payload: source.payload,
  })
}

export function toggleGearBuildLike(
  id: string,
  username: string
): { liked: boolean; likeCount: number } | null {
  const build = getGearBuild(id)
  if (!build) return null
  const normalized = username.toLowerCase()
  const database = getDb()
  const existing = database
    .prepare(
      `SELECT 1 AS ok FROM gear_build_likes WHERE build_id = ? AND username = ?`
    )
    .get(id, normalized) as { ok: number } | undefined

  if (existing) {
    database
      .prepare(
        `DELETE FROM gear_build_likes WHERE build_id = ? AND username = ?`
      )
      .run(id, normalized)
    const likeCount = syncLikeCount(id)
    return { liked: false, likeCount }
  }

  database
    .prepare(
      `INSERT INTO gear_build_likes (build_id, username, created_at) VALUES (?, ?, ?)`
    )
    .run(id, normalized, Date.now())
  const likeCount = syncLikeCount(id)
  return { liked: true, likeCount }
}

export function listLikedBuildIds(
  username: string,
  ids: string[]
): Set<string> {
  if (ids.length === 0) return new Set()
  const normalized = username.toLowerCase()
  const placeholders = ids.map(() => "?").join(", ")
  const rows = getDb()
    .prepare(
      `SELECT build_id FROM gear_build_likes
       WHERE username = ? AND build_id IN (${placeholders})`
    )
    .all(normalized, ...ids) as Array<{ build_id: string }>
  return new Set(rows.map((r) => r.build_id))
}

export function userLikesBuild(id: string, username: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM gear_build_likes WHERE build_id = ? AND username = ?`
    )
    .get(id, username.toLowerCase()) as { ok: number } | undefined
  return Boolean(row)
}

/** Test helper */
export function resetGearBuildsStoreForTests(): void {
  if (db) {
    db.close()
    db = null
  }
}
