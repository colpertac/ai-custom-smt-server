import zonesPayload from "@/content/wiki/zones.json"

/** Zone id → English display name (shared by Ask, walkthroughs, event catalog). */
export const ZONE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(zonesPayload.byZoneId).map(([id, name]) => [Number(id), name])
)

/** Japanese zone XML comment → English (used when scanning zone-*.xml headers). */
export const ZONE_COMMENT_EN: Record<string, string> =
  zonesPayload.commentEn ?? {}

export function getZoneName(zoneId: number): string | undefined {
  return ZONE_NAMES[zoneId]
}

export function zoneLabel(zoneId: number | null | undefined): string {
  if (zoneId == null) return "unknown zone"
  const name = ZONE_NAMES[zoneId]
  return name ? `${name} (${zoneId})` : String(zoneId)
}
