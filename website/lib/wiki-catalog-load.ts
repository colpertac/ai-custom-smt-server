import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import bakedItems from "@/content/wiki/items.json"
import bakedEnchants from "@/content/wiki/enchants.json"
import bakedCompShops from "@/content/wiki/item-comp-shops.json"
import type {
  WikiCatalogSource,
  WikiCompShopSourcesPayload,
  WikiEnchantsPayload,
  WikiItemsPayload,
} from "@/content/wiki/types"

type CacheEntry<T> = {
  path: string | null
  mtimeMs: number
  data: T
  source: WikiCatalogSource
}

let itemsCache: CacheEntry<WikiItemsPayload> | null = null
let enchantsCache: CacheEntry<WikiEnchantsPayload> | null = null

function runtimeRoot(): string | null {
  const runtime =
    process.env.OPS_RUNTIME?.trim() || process.env.COMP_RUNTIME?.trim()
  return runtime ? path.resolve(runtime) : null
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T
  } catch {
    return null
  }
}

function loadCached<T>(
  cache: CacheEntry<T> | null,
  filePath: string | null,
  baked: T
): CacheEntry<T> {
  if (!filePath || !existsSync(filePath)) {
    return {
      path: null,
      mtimeMs: 0,
      data: baked,
      source: "bundled",
    }
  }
  let mtimeMs = 0
  try {
    mtimeMs = statSync(filePath).mtimeMs
  } catch {
    return {
      path: null,
      mtimeMs: 0,
      data: baked,
      source: "bundled",
    }
  }
  if (cache && cache.path === filePath && cache.mtimeMs === mtimeMs) {
    return cache
  }
  const parsed = readJsonFile<T>(filePath)
  if (!parsed) {
    return {
      path: null,
      mtimeMs: 0,
      data: baked,
      source: "bundled",
    }
  }
  return {
    path: filePath,
    mtimeMs,
    data: parsed,
    source: "runtime",
  }
}

/** Prefer `{OPS_RUNTIME}/wiki/*.json` when present; else baked website content. */
export function loadWikiItemsPayload(): {
  data: WikiItemsPayload
  source: WikiCatalogSource
} {
  const root = runtimeRoot()
  const filePath = root ? path.join(root, "wiki", "items.json") : null
  itemsCache = loadCached(itemsCache, filePath, bakedItems as WikiItemsPayload)
  return { data: itemsCache.data, source: itemsCache.source }
}

export function loadWikiEnchantsPayload(): {
  data: WikiEnchantsPayload
  source: WikiCatalogSource
} {
  const root = runtimeRoot()
  const filePath = root ? path.join(root, "wiki", "enchants.json") : null
  enchantsCache = loadCached(
    enchantsCache,
    filePath,
    bakedEnchants as WikiEnchantsPayload
  )
  return { data: enchantsCache.data, source: enchantsCache.source }
}

export function loadWikiCompShopSources(): WikiCompShopSourcesPayload {
  return bakedCompShops as WikiCompShopSourcesPayload
}

/** Test helper — clear mtime caches. */
export function clearWikiCatalogCache(): void {
  itemsCache = null
  enchantsCache = null
}
