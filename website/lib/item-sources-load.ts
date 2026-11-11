import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { resolveWikiRuntimeRoot } from "@/lib/wiki-catalog-load"

export type ItemDropSource = {
  kind: string
  itemId: number
  rate?: number
  minStack?: number
  maxStack?: number
  zoneId?: number
  enemyType?: number
  spawnId?: number
  dropSetId?: number
  sourceFile?: string
  dropSetFile?: string
}

export type ItemWorldShopSource = {
  shopId: number
  shopName?: string
  tabName?: string
  productId: number
  basePrice?: number
  currency?: string
  sourceFile?: string
}

export type ItemQuestRequireSource = {
  questId: number
  /** Extract JSON uses `title`; older callers may use `questTitle`. */
  title?: string
  questTitle?: string
  phaseNumber?: number
  objectCount?: number
  requirementType?: string
}

export type ItemSourceEntry = {
  itemId: number
  drops: ItemDropSource[]
  worldShops?: ItemWorldShopSource[]
  questRequires?: ItemQuestRequireSource[]
}

export type ItemSourcesPayload = {
  source?: string
  generatedAt?: string
  note?: string
  stats?: Record<string, number>
  byItemId: Record<string, ItemSourceEntry>
}

export type SpawnRecord = {
  spawnId: number
  zoneId: number
  sourceFile?: string
  dropSetIds?: number[]
  zoneKind?: string
}

export type SpawnsByEnemyType = {
  enemyType: number
  zoneIds: number[]
  zoneCount: number
  spawnCount: number
  spawns: SpawnRecord[]
}

export type SpawnsPayload = {
  source?: string
  generatedAt?: string
  note?: string
  stats?: Record<string, number>
  byEnemyType: Record<string, SpawnsByEnemyType>
  plasmaByZone?: Record<string, unknown>
}

type CacheEntry<T> = {
  path: string | null
  mtimeMs: number
  data: T | null
}

let itemSourcesCache: CacheEntry<ItemSourcesPayload> | null = null
let spawnsCache: CacheEntry<SpawnsPayload> | null = null

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")
const CONTENT_WIKI = path.join(REPO_ROOT, "website", "content", "wiki")

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T
  } catch {
    return null
  }
}

function resolveWikiJsonPath(fileName: string): string | null {
  const runtimePath = path.join(resolveWikiRuntimeRoot(), "wiki", fileName)
  if (existsSync(runtimePath)) return runtimePath
  const contentPath = path.join(CONTENT_WIKI, fileName)
  if (existsSync(contentPath)) return contentPath
  return null
}

function loadOptionalCached<T>(
  cache: CacheEntry<T> | null,
  fileName: string
): CacheEntry<T> {
  const filePath = resolveWikiJsonPath(fileName)
  if (!filePath) {
    return { path: null, mtimeMs: 0, data: null }
  }
  let mtimeMs = 0
  try {
    mtimeMs = statSync(filePath).mtimeMs
  } catch {
    return { path: null, mtimeMs: 0, data: null }
  }
  if (cache && cache.path === filePath && cache.mtimeMs === mtimeMs) {
    return cache
  }
  const parsed = readJsonFile<T>(filePath)
  if (!parsed) {
    return { path: null, mtimeMs: 0, data: null }
  }
  return { path: filePath, mtimeMs, data: parsed }
}

/** Lazy-load item-sources.json (~9MB); null when missing. Never bundled in client JS. */
export function loadItemSourcesPayload(): ItemSourcesPayload | null {
  itemSourcesCache = loadOptionalCached(itemSourcesCache, "item-sources.json")
  return itemSourcesCache.data
}

/** Lazy-load spawns.json; null when missing. */
export function loadSpawnsPayload(): SpawnsPayload | null {
  spawnsCache = loadOptionalCached(spawnsCache, "spawns.json")
  return spawnsCache.data
}

export function getItemSourceEntry(itemId: number): ItemSourceEntry | undefined {
  const payload = loadItemSourcesPayload()
  if (!payload) return undefined
  return payload.byItemId[String(itemId)]
}

export function getSpawnsByEnemyType(
  enemyType: number
): SpawnsByEnemyType | undefined {
  const payload = loadSpawnsPayload()
  if (!payload) return undefined
  return payload.byEnemyType[String(enemyType)]
}

/** Test helper — clear mtime caches. */
export function clearItemSourcesCache(): void {
  itemSourcesCache = null
  spawnsCache = null
}
