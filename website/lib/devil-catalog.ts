import "server-only"

import {
  entriesFromDevilsPayload,
  type DevilCatalogEntry,
  type DevilsPayload,
} from "@/lib/armory-catalogs"
import { loadDevilsPayload } from "@/lib/wiki-catalog-load"

let cached: { payload: DevilsPayload; entries: DevilCatalogEntry[] } | null =
  null

function livePayload(): DevilsPayload {
  return loadDevilsPayload().data
}

/** DevilData from `{runtime}/wiki/devils.json` when wiki export has run, else bundled. */
export function listDevils(): DevilCatalogEntry[] {
  const payload = livePayload()
  if (cached?.payload === payload) return cached.entries
  const entries = entriesFromDevilsPayload(payload)
  cached = { payload, entries }
  return entries
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
