import path from "node:path"

import bakedCatalog from "@/content/avatar/catalog.json"
import type { WikiCatalogSource } from "@/content/wiki/types"
import { AVATAR_CATALOG_VERSION, type AvatarCatalog } from "@/lib/avatar-recipe"
import {
  loadCached,
  resolveWikiRuntimeRoot,
  type CacheEntry,
} from "@/lib/wiki-catalog-load"

const baked = bakedCatalog as unknown as AvatarCatalog

let cache: CacheEntry<AvatarCatalog> | null = null

/**
 * Avatar resolver catalog (avatar/tools/catalog.py): `{runtime}/avatar/catalog.json` when present
 * and of the expected version, else the baked copy in content/avatar. mtime-cached.
 */
export function loadAvatarCatalog(): {
  data: AvatarCatalog
  source: WikiCatalogSource
} {
  const filePath = path.join(resolveWikiRuntimeRoot(), "avatar", "catalog.json")
  cache = loadCached(cache, filePath, baked)
  if (
    cache.source === "runtime" &&
    cache.data.version !== AVATAR_CATALOG_VERSION
  ) {
    return { data: baked, source: "bundled" }
  }
  return { data: cache.data, source: cache.source }
}

/** Test helper — clear the mtime cache. */
export function clearAvatarCatalogCache(): void {
  cache = null
}
