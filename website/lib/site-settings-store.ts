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

export type UpdaterSiteSettings = {
  websiteUrl: string
  pageTitle: string
}

export type ClientPrepSettings = {
  host: string
  domain: string
  lobbyPort: string
  updaterPort: string
  loginPort: string
  title: string
  tag: string
  websiteUrl: string
}

const KEY_URL = "client_download_url"
const KEY_LABEL = "client_download_label"
const KEY_NOTES = "client_download_notes"
const KEY_UPDATER_WEBSITE = "updater_site_website_url"
const KEY_UPDATER_TITLE = "updater_site_page_title"
const KEY_CLIENT_PREP = "client_prep_json"

export const DEFAULT_CLIENT_PREP: ClientPrepSettings = {
  host: "",
  domain: "",
  lobbyPort: "10666",
  updaterPort: "8765",
  loginPort: "10999",
  title: "Private SMT",
  tag: "local",
  websiteUrl: "",
}

function parseClientPrepJson(raw: string | null): ClientPrepSettings {
  if (!raw?.trim()) return { ...DEFAULT_CLIENT_PREP }
  try {
    const o = JSON.parse(raw) as Partial<ClientPrepSettings>
    return {
      host: typeof o.host === "string" ? o.host : "",
      domain: typeof o.domain === "string" ? o.domain : "",
      lobbyPort:
        typeof o.lobbyPort === "string" && o.lobbyPort
          ? o.lobbyPort
          : DEFAULT_CLIENT_PREP.lobbyPort,
      updaterPort:
        typeof o.updaterPort === "string" && o.updaterPort
          ? o.updaterPort
          : DEFAULT_CLIENT_PREP.updaterPort,
      loginPort:
        typeof o.loginPort === "string" && o.loginPort
          ? o.loginPort
          : DEFAULT_CLIENT_PREP.loginPort,
      title:
        typeof o.title === "string" && o.title
          ? o.title
          : DEFAULT_CLIENT_PREP.title,
      tag:
        typeof o.tag === "string" && o.tag ? o.tag : DEFAULT_CLIENT_PREP.tag,
      websiteUrl: typeof o.websiteUrl === "string" ? o.websiteUrl : "",
    }
  } catch {
    return { ...DEFAULT_CLIENT_PREP }
  }
}

export function getClientPrepSettings(): ClientPrepSettings {
  const fromJson = parseClientPrepJson(getSiteSetting(KEY_CLIENT_PREP))
  const legacyWebsite = getSiteSetting(KEY_UPDATER_WEBSITE)?.trim() || ""
  return {
    ...fromJson,
    websiteUrl: fromJson.websiteUrl || legacyWebsite,
  }
}

export function setClientPrepSettings(
  input: Partial<ClientPrepSettings>
): ClientPrepSettings {
  const current = getClientPrepSettings()
  const next: ClientPrepSettings = {
    host: input.host !== undefined ? input.host.trim() : current.host,
    domain: input.domain !== undefined ? input.domain.trim() : current.domain,
    lobbyPort:
      input.lobbyPort !== undefined
        ? input.lobbyPort.trim() || DEFAULT_CLIENT_PREP.lobbyPort
        : current.lobbyPort,
    updaterPort:
      input.updaterPort !== undefined
        ? input.updaterPort.trim() || DEFAULT_CLIENT_PREP.updaterPort
        : current.updaterPort,
    loginPort:
      input.loginPort !== undefined
        ? input.loginPort.trim() || DEFAULT_CLIENT_PREP.loginPort
        : current.loginPort,
    title:
      input.title !== undefined
        ? input.title.trim() || DEFAULT_CLIENT_PREP.title
        : current.title,
    tag:
      input.tag !== undefined
        ? input.tag.trim() || DEFAULT_CLIENT_PREP.tag
        : current.tag,
    websiteUrl:
      input.websiteUrl !== undefined
        ? input.websiteUrl.trim()
        : current.websiteUrl,
  }
  setSiteSetting(KEY_CLIENT_PREP, JSON.stringify(next))
  setSiteSetting(KEY_UPDATER_WEBSITE, next.websiteUrl)
  setSiteSetting(KEY_UPDATER_TITLE, next.title)
  return next
}

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

export function getUpdaterSiteSettings(): UpdaterSiteSettings {
  return {
    websiteUrl: getSiteSetting(KEY_UPDATER_WEBSITE)?.trim() || "",
    pageTitle: getSiteSetting(KEY_UPDATER_TITLE)?.trim() || "",
  }
}

export function setUpdaterSiteSettings(
  input: Partial<UpdaterSiteSettings>
): UpdaterSiteSettings {
  if (input.websiteUrl !== undefined) {
    setSiteSetting(KEY_UPDATER_WEBSITE, input.websiteUrl.trim())
  }
  if (input.pageTitle !== undefined) {
    setSiteSetting(KEY_UPDATER_TITLE, input.pageTitle.trim())
  }
  return getUpdaterSiteSettings()
}
