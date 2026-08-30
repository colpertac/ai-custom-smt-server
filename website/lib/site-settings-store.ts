import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite.ts"

function dbPath(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "web.sqlite")
}

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  return db
}

export function getSiteSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM site_settings WHERE key = ?")
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSiteSetting(key: string, value: string): void {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, now)
}

export type ClientDownloadSettings = {
  url: string
  label: string
  notes: string
}

const KEY_URL = "client_download_url"
const KEY_LABEL = "client_download_label"
const KEY_NOTES = "client_download_notes"

export function getClientDownloadSettings(): ClientDownloadSettings {
  return {
    url: getSiteSetting(KEY_URL)?.trim() || "",
    label: getSiteSetting(KEY_LABEL)?.trim() || "Download client",
    notes: getSiteSetting(KEY_NOTES)?.trim() || "",
  }
}

export function setClientDownloadSettings(
  input: Partial<ClientDownloadSettings>
): ClientDownloadSettings {
  if (input.url !== undefined) {
    setSiteSetting(KEY_URL, input.url.trim())
  }
  if (input.label !== undefined) {
    setSiteSetting(KEY_LABEL, input.label.trim() || "Download client")
  }
  if (input.notes !== undefined) {
    setSiteSetting(KEY_NOTES, input.notes.trim())
  }
  return getClientDownloadSettings()
}
