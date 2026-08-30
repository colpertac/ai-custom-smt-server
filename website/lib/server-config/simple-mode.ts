import type { ConfigFileId, FieldDef } from "./types.ts"

/** Gameplay-focused fields shown in Simple mode (lobby / world / channel). */
export const SIMPLE_FIELDS: Partial<Record<ConfigFileId, readonly string[]>> = {
  lobby: [
    "ClientVersion",
    "CharacterDeletionDelay",
    "CharacterTicketCost",
    "StartupCharacterDelete",
    "RegistrationTicketCount",
    "RegistrationUserLevel",
    "RegistrationAccountEnabled",
    "PlayOpeningMovie",
    "AllowImport",
    "ImportStripUserLevel",
    "ImportStripCP",
    "MaxClients",
  ],
  world: ["Name", "ChannelConnectionTimeout", "WorldSharedConfig"],
  channel: [
    "Name",
    "Timeout",
    "SystemMessage",
    "SystemMessageColor",
    "WorldSharedConfig",
    "PerfMonitorEnabled",
    "VerifyServerData",
  ],
}

export function supportsSimpleMode(id: string): boolean {
  return id === "lobby" || id === "world" || id === "channel"
}

/** Filter schema fields for Simple mode; nested WorldSharedConfig keeps all children. */
export function filterFieldsForSimpleMode(
  id: ConfigFileId,
  fields: FieldDef[],
  simple: boolean
): FieldDef[] {
  if (!simple) return fields
  const allow = SIMPLE_FIELDS[id]
  if (!allow?.length) return fields
  const set = new Set(allow)
  return fields.filter((f) => set.has(f.name))
}
