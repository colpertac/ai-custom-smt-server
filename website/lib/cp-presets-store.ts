import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite.ts"

export type EconomyPreset = {
  id: string
  label: string
  blurb: string
  bronze: number
  silver: number
  gold: number
  bearcatMult: number
  diaspora: number
  bossMultOfGold: number
  special: number
  sortOrder: number
}

export type EconomyPresetInput = {
  id?: string
  label: string
  blurb?: string
  bronze: number
  silver: number
  gold: number
  bearcatMult: number
  diaspora: number
  bossMultOfGold: number
  special: number
}

/** Built-in defaults seeded when the table is empty. */
export const DEFAULT_CP_PRESETS: Omit<EconomyPreset, "sortOrder">[] = [
  {
    id: "grindy",
    label: "Grindy",
    blurb: "Typical PS grind — bronze ~5 CP",
    bronze: 5,
    silver: 12,
    gold: 25,
    bearcatMult: 1.5,
    diaspora: 120,
    bossMultOfGold: 1.2,
    special: 8,
  },
  {
    id: "normal",
    label: "Normal",
    blurb: "Mid casual — bronze ~20 CP",
    bronze: 20,
    silver: 50,
    gold: 120,
    bearcatMult: 1.5,
    diaspora: 200,
    bossMultOfGold: 1.15,
    special: 25,
  },
  {
    id: "generous",
    label: "Generous",
    blurb: "Casual — bronze ~50 CP",
    bronze: 50,
    silver: 120,
    gold: 250,
    bearcatMult: 1.5,
    diaspora: 400,
    bossMultOfGold: 1.2,
    special: 50,
  },
]

function dbPath(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "web.sqlite")
}

let db: DatabaseSync | null = null

type PresetRow = {
  id: string
  label: string
  blurb: string
  bronze: number
  silver: number
  gold: number
  bearcat_mult: number
  diaspora: number
  boss_mult_of_gold: number
  special: number
  sort_order: number
}

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS cp_presets (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      blurb TEXT NOT NULL DEFAULT '',
      bronze REAL NOT NULL,
      silver REAL NOT NULL,
      gold REAL NOT NULL,
      bearcat_mult REAL NOT NULL,
      diaspora REAL NOT NULL,
      boss_mult_of_gold REAL NOT NULL,
      special REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `)
  seedIfEmpty(db)
  return db
}

function rowToPreset(row: PresetRow): EconomyPreset {
  return {
    id: row.id,
    label: row.label,
    blurb: row.blurb,
    bronze: row.bronze,
    silver: row.silver,
    gold: row.gold,
    bearcatMult: row.bearcat_mult,
    diaspora: row.diaspora,
    bossMultOfGold: row.boss_mult_of_gold,
    special: row.special,
    sortOrder: row.sort_order,
  }
}

function seedIfEmpty(database: DatabaseSync): void {
  const count = database
    .prepare("SELECT COUNT(*) AS n FROM cp_presets")
    .get() as { n: number }
  if (count.n > 0) return
  const now = Date.now()
  const insert = database.prepare(
    `INSERT INTO cp_presets (
      id, label, blurb, bronze, silver, gold, bearcat_mult, diaspora,
      boss_mult_of_gold, special, sort_order, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  DEFAULT_CP_PRESETS.forEach((p, i) => {
    insert.run(
      p.id,
      p.label,
      p.blurb,
      p.bronze,
      p.silver,
      p.gold,
      p.bearcatMult,
      p.diaspora,
      p.bossMultOfGold,
      p.special,
      i,
      now
    )
  })
}

export function slugifyPresetId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

export class CpPresetNotFoundError extends Error {
  constructor(id: string) {
    super(`CP preset '${id}' not found`)
    this.name = "CpPresetNotFoundError"
  }
}

export class CpPresetConflictError extends Error {
  constructor(id: string) {
    super(`CP preset '${id}' already exists`)
    this.name = "CpPresetConflictError"
  }
}

export function listCpPresets(): EconomyPreset[] {
  const rows = getDb()
    .prepare(
      `SELECT id, label, blurb, bronze, silver, gold, bearcat_mult, diaspora,
              boss_mult_of_gold, special, sort_order
       FROM cp_presets
       ORDER BY sort_order ASC, label ASC`
    )
    .all() as PresetRow[]
  return rows.map(rowToPreset)
}

export function getCpPreset(id: string): EconomyPreset | null {
  const row = getDb()
    .prepare(
      `SELECT id, label, blurb, bronze, silver, gold, bearcat_mult, diaspora,
              boss_mult_of_gold, special, sort_order
       FROM cp_presets WHERE id = ?`
    )
    .get(id) as PresetRow | undefined
  return row ? rowToPreset(row) : null
}

function nextSortOrder(): number {
  const row = getDb()
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM cp_presets")
    .get() as { m: number }
  return row.m + 1
}

export function createCpPreset(input: EconomyPresetInput): EconomyPreset {
  const id = slugifyPresetId(input.id?.trim() || input.label)
  if (!id) throw new Error("Preset id is required")
  if (getCpPreset(id)) throw new CpPresetConflictError(id)

  const now = Date.now()
  const sortOrder = nextSortOrder()
  getDb()
    .prepare(
      `INSERT INTO cp_presets (
        id, label, blurb, bronze, silver, gold, bearcat_mult, diaspora,
        boss_mult_of_gold, special, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.label.trim(),
      (input.blurb ?? "").trim(),
      input.bronze,
      input.silver,
      input.gold,
      input.bearcatMult,
      input.diaspora,
      input.bossMultOfGold,
      input.special,
      sortOrder,
      now
    )
  const created = getCpPreset(id)
  if (!created) throw new Error("Failed to create preset")
  return created
}

export function updateCpPreset(
  id: string,
  input: EconomyPresetInput
): EconomyPreset {
  const existing = getCpPreset(id)
  if (!existing) throw new CpPresetNotFoundError(id)

  getDb()
    .prepare(
      `UPDATE cp_presets SET
        label = ?, blurb = ?, bronze = ?, silver = ?, gold = ?,
        bearcat_mult = ?, diaspora = ?, boss_mult_of_gold = ?, special = ?,
        updated_at = ?
       WHERE id = ?`
    )
    .run(
      input.label.trim(),
      (input.blurb ?? "").trim(),
      input.bronze,
      input.silver,
      input.gold,
      input.bearcatMult,
      input.diaspora,
      input.bossMultOfGold,
      input.special,
      Date.now(),
      id
    )
  const updated = getCpPreset(id)
  if (!updated) throw new Error("Failed to update preset")
  return updated
}

export function deleteCpPreset(id: string): void {
  const result = getDb().prepare("DELETE FROM cp_presets WHERE id = ?").run(id)
  if (result.changes === 0) throw new CpPresetNotFoundError(id)
}

export function duplicateCpPreset(
  id: string,
  label?: string
): EconomyPreset {
  const source = getCpPreset(id)
  if (!source) throw new CpPresetNotFoundError(id)

  const baseLabel = (label?.trim() || `${source.label} copy`).slice(0, 80)
  let candidate = slugifyPresetId(baseLabel)
  if (!candidate) candidate = `${source.id}-copy`
  let n = 2
  while (getCpPreset(candidate)) {
    candidate = slugifyPresetId(`${baseLabel}-${n}`)
    n += 1
    if (n > 50) throw new Error("Could not allocate unique preset id")
  }

  return createCpPreset({
    id: candidate,
    label: baseLabel,
    blurb: source.blurb,
    bronze: source.bronze,
    silver: source.silver,
    gold: source.gold,
    bearcatMult: source.bearcatMult,
    diaspora: source.diaspora,
    bossMultOfGold: source.bossMultOfGold,
    special: source.special,
  })
}

/** Upsert the three built-in presets without removing custom ones. */
export function restoreDefaultCpPresets(): EconomyPreset[] {
  const now = Date.now()
  const database = getDb()
  const upsert = database.prepare(
    `INSERT INTO cp_presets (
      id, label, blurb, bronze, silver, gold, bearcat_mult, diaspora,
      boss_mult_of_gold, special, sort_order, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      blurb = excluded.blurb,
      bronze = excluded.bronze,
      silver = excluded.silver,
      gold = excluded.gold,
      bearcat_mult = excluded.bearcat_mult,
      diaspora = excluded.diaspora,
      boss_mult_of_gold = excluded.boss_mult_of_gold,
      special = excluded.special,
      updated_at = excluded.updated_at`
  )
  DEFAULT_CP_PRESETS.forEach((p, i) => {
    upsert.run(
      p.id,
      p.label,
      p.blurb,
      p.bronze,
      p.silver,
      p.gold,
      p.bearcatMult,
      p.diaspora,
      p.bossMultOfGold,
      p.special,
      i,
      now
    )
  })
  return listCpPresets()
}
