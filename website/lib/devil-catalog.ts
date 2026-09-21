import "server-only"

import {
  entriesFromDevilsPayload,
  type DevilCatalogEntry,
  type DevilsPayload,
} from "@/lib/armory-catalogs"
import { loadDevilsPayload } from "@/lib/wiki-catalog-load"

let cached: { payload: DevilsPayload; entries: DevilCatalogEntry[] } | null =
  null
let byIdCache: Map<number, DevilCatalogEntry> | null = null

function livePayload(): DevilsPayload {
  return loadDevilsPayload().data
}

function entries(): DevilCatalogEntry[] {
  const payload = livePayload()
  if (cached?.payload === payload) return cached.entries
  const list = entriesFromDevilsPayload(payload)
  cached = { payload, entries: list }
  byIdCache = null
  return list
}

/** DevilData from `{runtime}/wiki/devils.json` when wiki export has run, else bundled. */
export function listDevils(): DevilCatalogEntry[] {
  return entries()
}

function byId(): Map<number, DevilCatalogEntry> {
  if (byIdCache) return byIdCache
  const map = new Map<number, DevilCatalogEntry>()
  for (const d of entries()) map.set(d.id, d)
  byIdCache = map
  return map
}

export function getDevil(id: number): DevilCatalogEntry | undefined {
  return byId().get(id)
}

/** All forms sharing the same stock baseDemonId (includes stock). */
export function listDevilFamily(baseDemonId: number): DevilCatalogEntry[] {
  return entries().filter((d) => d.baseDemonId === baseDemonId)
}

export function hasDevilType(type: number): boolean {
  return Object.prototype.hasOwnProperty.call(
    livePayload().names,
    String(type)
  )
}

export function getDevilName(type: number): string {
  return livePayload().names[String(type)] ?? `Demon ${type}`
}
