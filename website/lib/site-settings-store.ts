import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite.ts"
import { DEFAULT_SITE_NAME } from "./website-branding.ts"

export { DEFAULT_SITE_NAME } from "./website-branding.ts"

export function websiteDataDir(): string {
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

export function deleteSiteSetting(key: string): void {
  getDb().prepare("DELETE FROM site_settings WHERE key = ?").run(key)
}

export function getSiteSettingUpdatedAt(key: string): number | null {
  const row = getDb()
    .prepare("SELECT updated_at FROM site_settings WHERE key = ?")
    .get(key) as { updated_at: number } | undefined
  return row?.updated_at ?? null
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
  includeLocalServer: boolean
  localTitle: string
  localHost: string
  localTag: string
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
  tag: "main",
  websiteUrl: "",
  includeLocalServer: false,
  localTitle: "Local Server",
  localHost: "127.0.0.1",
  localTag: "local",
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
      includeLocalServer: o.includeLocalServer === true,
      localTitle:
        typeof o.localTitle === "string" && o.localTitle
          ? o.localTitle
          : DEFAULT_CLIENT_PREP.localTitle,
      localHost:
        typeof o.localHost === "string" && o.localHost
          ? o.localHost
          : DEFAULT_CLIENT_PREP.localHost,
      localTag:
        typeof o.localTag === "string" && o.localTag
          ? o.localTag
          : DEFAULT_CLIENT_PREP.localTag,
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
    includeLocalServer:
      input.includeLocalServer !== undefined
        ? input.includeLocalServer
        : current.includeLocalServer,
    localTitle:
      input.localTitle !== undefined
        ? input.localTitle.trim() || DEFAULT_CLIENT_PREP.localTitle
        : current.localTitle,
    localHost:
      input.localHost !== undefined
        ? input.localHost.trim() || DEFAULT_CLIENT_PREP.localHost
        : current.localHost,
    localTag:
      input.localTag !== undefined
        ? input.localTag.trim() || DEFAULT_CLIENT_PREP.localTag
        : current.localTag,
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

const KEY_BRANDING_SITE_NAME = "branding_site_name"
const KEY_BRANDING_ICON_EXT = "branding_icon_ext"

export const BRANDING_ICON_MAX_BYTES = 512 * 1024

export type BrandingIconExt = "png" | "jpg" | "webp" | "ico"

export type WebsiteBranding = {
  siteName: string
  hasCustomIcon: boolean
  iconExt: BrandingIconExt | null
  iconUrl: string | null
  iconUpdatedAt: number | null
}

const BRANDING_ICON_EXTS = new Set<BrandingIconExt>([
  "png",
  "jpg",
  "webp",
  "ico",
])

const BRANDING_CONTENT_TYPES: Record<BrandingIconExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
}

function brandingDir(): string {
  const dir = path.join(websiteDataDir(), "branding")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function parseIconExt(raw: string | null): BrandingIconExt | null {
  const v = raw?.trim().toLowerCase()
  if (!v || !BRANDING_ICON_EXTS.has(v as BrandingIconExt)) return null
  return v as BrandingIconExt
}

export function brandingIconContentType(ext: BrandingIconExt): string {
  return BRANDING_CONTENT_TYPES[ext]
}

export function brandingIconPath(ext?: BrandingIconExt | null): string | null {
  const resolved = ext ?? parseIconExt(getSiteSetting(KEY_BRANDING_ICON_EXT))
  if (!resolved) return null
  return path.join(brandingDir(), `icon.${resolved}`)
}

export function brandingIconPublicUrl(updatedAt?: number | null): string | null {
  const ext = parseIconExt(getSiteSetting(KEY_BRANDING_ICON_EXT))
  if (!ext) return null
  const file = brandingIconPath(ext)
  if (!file || !fs.existsSync(file)) return null
  const v =
    updatedAt ??
    getSiteSettingUpdatedAt(KEY_BRANDING_ICON_EXT) ??
    Date.now()
  return `/api/branding/icon?v=${v}`
}

export function getWebsiteBranding(): WebsiteBranding {
  const siteName =
    getSiteSetting(KEY_BRANDING_SITE_NAME)?.trim() || DEFAULT_SITE_NAME
  const iconExt = parseIconExt(getSiteSetting(KEY_BRANDING_ICON_EXT))
  const iconUpdatedAt = getSiteSettingUpdatedAt(KEY_BRANDING_ICON_EXT)
  const iconUrl = brandingIconPublicUrl(iconUpdatedAt)
  return {
    siteName,
    hasCustomIcon: Boolean(iconUrl),
    iconExt: iconUrl ? iconExt : null,
    iconUrl,
    iconUpdatedAt: iconUrl ? iconUpdatedAt : null,
  }
}

export function setWebsiteBrandingName(siteName: string): WebsiteBranding {
  const trimmed = siteName.trim()
  if (!trimmed) {
    deleteSiteSetting(KEY_BRANDING_SITE_NAME)
  } else {
    setSiteSetting(KEY_BRANDING_SITE_NAME, trimmed)
  }
  return getWebsiteBranding()
}

export class BrandingIconValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BrandingIconValidationError"
  }
}

function detectBrandingIconExt(buf: Buffer): BrandingIconExt | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "png"
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg"
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp"
  }
  if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return "ico"
  }
  return null
}

export function setWebsiteBrandingIcon(bytes: Buffer): WebsiteBranding {
  if (!bytes.length) {
    throw new BrandingIconValidationError("Empty file")
  }
  if (bytes.length > BRANDING_ICON_MAX_BYTES) {
    throw new BrandingIconValidationError("File too large (max 512 KiB)")
  }
  const ext = detectBrandingIconExt(bytes)
  if (!ext) {
    throw new BrandingIconValidationError(
      "File must be PNG, JPEG, WebP, or ICO"
    )
  }

  const dir = brandingDir()
  const dest = path.join(dir, `icon.${ext}`)
  const tmp = path.join(dir, `icon.${ext}.${process.pid}.tmp`)

  const previousExt = parseIconExt(getSiteSetting(KEY_BRANDING_ICON_EXT))
  fs.writeFileSync(tmp, bytes)
  fs.renameSync(tmp, dest)

  if (previousExt && previousExt !== ext) {
    const oldPath = path.join(dir, `icon.${previousExt}`)
    try {
      fs.unlinkSync(oldPath)
    } catch {
      /* ignore missing */
    }
  }

  setSiteSetting(KEY_BRANDING_ICON_EXT, ext)
  return getWebsiteBranding()
}

export function clearWebsiteBrandingIcon(): WebsiteBranding {
  const previousExt = parseIconExt(getSiteSetting(KEY_BRANDING_ICON_EXT))
  deleteSiteSetting(KEY_BRANDING_ICON_EXT)
  if (previousExt) {
    const oldPath = path.join(brandingDir(), `icon.${previousExt}`)
    try {
      fs.unlinkSync(oldPath)
    } catch {
      /* ignore missing */
    }
  }
  return getWebsiteBranding()
}

export function readWebsiteBrandingIcon(): {
  bytes: Buffer
  contentType: string
  updatedAt: number | null
} | null {
  const ext = parseIconExt(getSiteSetting(KEY_BRANDING_ICON_EXT))
  if (!ext) return null
  const file = brandingIconPath(ext)
  if (!file || !fs.existsSync(file)) return null
  return {
    bytes: fs.readFileSync(file),
    contentType: brandingIconContentType(ext),
    updatedAt: getSiteSettingUpdatedAt(KEY_BRANDING_ICON_EXT),
  }
}
