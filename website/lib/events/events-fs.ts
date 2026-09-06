import { promises as fs } from "node:fs"
import path from "node:path"

import {
  fieldsForObjgen,
  getLiveConfigDir,
  getWorkingConfigDir,
  listConfigStatus,
  loadConfigDocument,
  writeWorkingXml,
} from "../server-config/fs.ts"
import { serializeObjgenConfig } from "../server-config/objgen-config.ts"
import { validateConfigDocument } from "../server-config/validate.ts"
import type { ObjgenDocument } from "../server-config/types.ts"
import type {
  AdminEventsResponse,
  CompEvent,
  EventsCatalog,
  EventStatus,
  UpdateEventsResponse,
} from "./types.ts"

/** Resolve from app cwd — import.meta.url breaks under Turbopack chunking. */
const CATALOG_PATH = path.resolve(
  process.cwd(),
  "content",
  "events",
  "events-catalog.json"
)

let catalogCache: { catalog: EventsCatalog; mtimeMs: number } | null = null

export async function getEventsCatalog(): Promise<EventsCatalog> {
  const stat = await fs.stat(CATALOG_PATH)
  if (catalogCache && catalogCache.mtimeMs === stat.mtimeMs) {
    return catalogCache.catalog
  }
  const raw = await fs.readFile(CATALOG_PATH, "utf8")
  const catalog = JSON.parse(raw) as EventsCatalog
  catalogCache = { catalog, mtimeMs: stat.mtimeMs }
  return catalog
}

export function clearEventsCatalogCache(): void {
  catalogCache = null
}

export async function getActiveEventIdsFromChannel(): Promise<{
  activeIds: Set<string>
  fullDataStore: string[]
  isDirty: boolean
  workingXmlPath: string
  liveXmlPath: string
}> {
  const { document } = await loadConfigDocument("channel")
  const objDoc = document as ObjgenDocument

  const rawDataStore = objDoc.members["DataStore"]
  const dataStoreList: string[] = Array.isArray(rawDataStore)
    ? rawDataStore.map((x) => String(x ?? "").trim()).filter(Boolean)
    : []

  const activeIds = new Set<string>()
  for (const entry of dataStoreList) {
    const match = entry.match(/^datastore\/partials\/([^/]+)$/)
    if (match) {
      activeIds.add(match[1])
    }
  }

  const statuses = await listConfigStatus()
  const channelStatus = statuses.find((s) => s.id === "channel")
  const isDirty = channelStatus?.dirty ?? false

  const workingXmlPath = path.join(getWorkingConfigDir(), "channel.xml")
  const liveXmlPath = path.join(getLiveConfigDir(), "channel.xml")

  return {
    activeIds,
    fullDataStore: dataStoreList,
    isDirty,
    workingXmlPath,
    liveXmlPath,
  }
}

export async function getEventsAdminStatus(): Promise<AdminEventsResponse> {
  const [catalog, channelInfo] = await Promise.all([
    getEventsCatalog(),
    getActiveEventIdsFromChannel(),
  ])

  const knownIds = new Set(catalog.events.map((e) => e.id))

  // Build list of events with active status
  const events: EventStatus[] = catalog.events.map((evt) => ({
    ...evt,
    active: channelInfo.activeIds.has(evt.id),
  }))

  // Also include any active event partials from channel.xml that weren't in the catalog
  for (const activeId of channelInfo.activeIds) {
    if (!knownIds.has(activeId)) {
      events.push({
        id: activeId,
        folder: `datastore/partials/${activeId}`,
        titleJp: activeId,
        titleEn: activeId,
        category: "special",
        year: 2010,
        month: 1,
        summary: `Custom partial ${activeId} enabled in channel.xml DataStore.`,
        affectedZones: [],
        featuredNpcs: [],
        npcSpawns: [],
        xmlCount: 1,
        active: true,
      })
    }
  }

  const activeCount = events.filter((e) => e.active).length

  return {
    events,
    activeCount,
    isDirty: channelInfo.isDirty,
    workingXmlPath: channelInfo.workingXmlPath,
    liveXmlPath: channelInfo.liveXmlPath,
  }
}

export async function updateActiveEvents(
  newActiveIds: string[]
): Promise<UpdateEventsResponse> {
  const { document } = await loadConfigDocument("channel")
  const fields = await fieldsForObjgen("channel")
  const objDoc = document as ObjgenDocument

  const rawDataStore = objDoc.members["DataStore"]
  const currentList: string[] = Array.isArray(rawDataStore)
    ? rawDataStore.map((x) => String(x ?? "").trim()).filter(Boolean)
    : []

  // Preserve non-partial entries (like base 'datastore' or custom packages)
  const nonPartialEntries = currentList.filter(
    (item) => !item.startsWith("datastore/partials/")
  )
  if (!nonPartialEntries.includes("datastore")) {
    nonPartialEntries.unshift("datastore")
  }

  // Construct updated DataStore list
  const requestedPartials = Array.from(new Set(newActiveIds))
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => (id.startsWith("datastore/partials/") ? id : `datastore/partials/${id}`))

  const updatedDataStore = [...nonPartialEntries, ...requestedPartials]

  objDoc.members["DataStore"] = updatedDataStore

  // Validate objgen doc
  const issues = validateConfigDocument(objDoc, fields)
  const errors = issues.filter((i) => i.severity === "error")
  if (errors.length > 0) {
    throw new Error(
      `Failed to validate channel.xml after updating events: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`
    )
  }

  const xml = serializeObjgenConfig(objDoc)
  await writeWorkingXml("channel", xml)

  const activeIds = requestedPartials.map((p) => p.replace(/^datastore\/partials\//, ""))
  const statuses = await listConfigStatus()
  const isDirty = statuses.find((s) => s.id === "channel")?.dirty ?? true

  return {
    success: true,
    activeCount: activeIds.length,
    activeIds,
    isDirty,
    warnings: issues.filter((i) => i.severity === "warning").map((w) => w.message),
  }
}
