export const NULL_UUID = "00000000-0000-0000-0000-000000000000"
export const MAX_CHARACTER_SLOTS = 20
export const MAX_IMPORT_BYTES = 5120 * 1024
export const STAGING_TTL_MS = 15 * 60 * 1000

export const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g

export type BackupCharacterSummary = {
  uuid: string
  name: string
  level: number
  gender: string
}

export type StripPreview = {
  unknownItems: { type: number; count: number }[]
  unknownDemons: { type: number; count: number }[]
  skippedAccountDepotBoxes: number
}

export type CharacterImportPreview = {
  uploadToken: string
  characters: BackupCharacterSummary[]
  takenNames: string[]
  freeSlots: number
  occupiedSlots: number
  strip: StripPreview
  notes: string[]
}

export type CharacterImportSelection = {
  /** Original name in the backup dump. */
  sourceName: string
  /** Name to use on this server (required if sourceName is taken). */
  newName: string
}

export type CharacterImportResult = {
  imported: { sourceName: string; newName: string; uuid: string }[]
  strippedItems: number
  strippedDemons: number
  skippedAccountDepotBoxes: number
}
