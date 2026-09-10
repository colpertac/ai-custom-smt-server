/** Parsed catalog zone label from extract-event-catalog. */
export type ParsedZoneLabel = {
  /** Short name for chips / public copy. */
  displayName: string
  /** True when the catalog ID is a DynamicMapID (not a ServerZone / @zone ID). */
  isDynamicMap: boolean
  serverZoneId: number | null
  dynamicMapId: number | null
  raw: string
}

const DYNAMIC_SUFFIX =
  /^(.*?)\s*\(zone\s+(\d+)\s*[·•]\s*map\s+(\d+)\)\s*$/i
const PLAIN_ID_SUFFIX = /^(.*?)\s*\((\d+)\)\s*$/
const BARE_ZONE = /^Zone\s+(\d+)$/i

/**
 * Parse affectedZones strings from the catalog.
 * Dynamic maps look like: `Virtual Tropical Beach (zone 740101 · map 7401001)`.
 */
export function parseAffectedZoneLabel(zone: string): ParsedZoneLabel {
  const raw = zone.trim()
  const dyn = raw.match(DYNAMIC_SUFFIX)
  if (dyn) {
    return {
      displayName: dyn[1].trim() || raw,
      isDynamicMap: true,
      serverZoneId: parseInt(dyn[2], 10),
      dynamicMapId: parseInt(dyn[3], 10),
      raw,
    }
  }
  const plain = raw.match(PLAIN_ID_SUFFIX)
  if (plain) {
    return {
      displayName: plain[1].trim() || raw,
      isDynamicMap: false,
      serverZoneId: parseInt(plain[2], 10),
      dynamicMapId: null,
      raw,
    }
  }
  const bare = raw.match(BARE_ZONE)
  if (bare) {
    const id = parseInt(bare[1], 10)
    return {
      displayName: raw,
      // Unresolved numeric labels are usually DynamicMapIDs from partials.
      isDynamicMap: true,
      serverZoneId: null,
      dynamicMapId: id,
      raw,
    }
  }
  return {
    displayName: raw,
    isDynamicMap: false,
    serverZoneId: null,
    dynamicMapId: null,
    raw,
  }
}

/** NPC spawn row: DynamicMapID when serverZoneId differs from zoneId. */
export function isDynamicNpcSpawn(zoneId: number, serverZoneId?: number | null): boolean {
  return serverZoneId != null && serverZoneId !== zoneId
}
