import "server-only"

import { listAllCharacterNames } from "@/lib/admin-characters"
import { hasDevilType } from "@/lib/armory-catalogs"
import { previewStripForCharacters } from "@/lib/character-import/character-graph"
import {
  loadCharacterImportLobbyConfig,
  validateImportCharacterName,
} from "@/lib/character-import/lobby-config"
import { BackupParseError, parseBackupXml } from "@/lib/character-import/parse-backup-xml"
import { countOccupiedSlots } from "@/lib/character-import/slots"
import { stageBackupXml } from "@/lib/character-import/staging"
import {
  MAX_CHARACTER_SLOTS,
  MAX_IMPORT_BYTES,
  type CharacterImportPreview,
  type CharacterImportSelection,
} from "@/lib/character-import/types"
import { lookupAccountUid } from "@/lib/lobby-db"
import { getLobbyDb } from "@/lib/lobby-db"
import { getWikiItem } from "@/lib/wiki-catalog"

function isKnownItem(type: number): boolean {
  return getWikiItem(type) != null
}

function isKnownDemon(type: number): boolean {
  return hasDevilType(type)
}

export function assertImportPayloadSize(size: number): void {
  if (size <= 0) throw new Error("Empty file")
  if (size > MAX_IMPORT_BYTES) {
    throw new Error("File too large (max ~5 MiB)")
  }
}

export async function buildCharacterImportPreview(opts: {
  username: string
  xml: string
  filename: string
}): Promise<CharacterImportPreview> {
  const parsed = parseBackupXml(opts.xml)
  const accountUid = lookupAccountUid(opts.username)
  if (!accountUid) {
    throw new Error("Account not found")
  }

  const row = getLobbyDb()
    .prepare(`SELECT Characters FROM Account WHERE UID = ?`)
    .get(accountUid) as { Characters: Uint8Array | Buffer | null } | undefined
  const occupiedSlots = countOccupiedSlots(row?.Characters)
  const freeSlots = Math.max(0, MAX_CHARACTER_SLOTS - occupiedSlots)

  const takenSet = new Set(
    listAllCharacterNames().map((n) => n.toLowerCase())
  )
  const takenNames = parsed.characters
    .filter((c) => takenSet.has(c.name.toLowerCase()))
    .map((c) => c.name)

  const strip = previewStripForCharacters(
    parsed,
    parsed.characters.map((c) => c.uuid),
    isKnownItem,
    isKnownDemon
  )

  const uploadToken = stageBackupXml(opts.username, opts.xml, opts.filename)

  const notes = [
    "Log out of the game client before importing.",
    "Account depot / warehouse boxes in the backup are not imported.",
    "Password, CP, tickets, and GM level from the file are ignored.",
    "Unknown items and demons (not on this server) will be removed.",
  ]

  return {
    uploadToken,
    characters: parsed.characters,
    takenNames,
    freeSlots,
    occupiedSlots,
    strip,
    notes,
  }
}

export async function validateSelections(opts: {
  username: string
  xml: string
  selections: CharacterImportSelection[]
}): Promise<{
  parsed: ReturnType<typeof parseBackupXml>
  registrationUserLevel: number
  freeSlots: number
}> {
  if (!opts.selections.length) {
    throw new Error("Select at least one character")
  }

  const parsed = parseBackupXml(opts.xml)
  const cfg = await loadCharacterImportLobbyConfig()
  const takenSet = new Set(
    listAllCharacterNames().map((n) => n.toLowerCase())
  )

  const seenNew = new Set<string>()
  const bySource = new Map(parsed.characters.map((c) => [c.name, c]))

  for (const sel of opts.selections) {
    if (!bySource.has(sel.sourceName)) {
      throw new Error(`Character "${sel.sourceName}" not in dump`)
    }
    const err = validateImportCharacterName(
      sel.newName,
      cfg.characterNameRegex
    )
    if (err) {
      throw new Error(`${sel.sourceName}: ${err}`)
    }
    const key = sel.newName.trim().toLowerCase()
    if (seenNew.has(key)) {
      throw new Error(`Duplicate import name "${sel.newName}"`)
    }
    seenNew.add(key)
    if (takenSet.has(key)) {
      throw new Error(
        `Character name "${sel.newName}" is already taken on this server`
      )
    }
  }

  const accountUid = lookupAccountUid(opts.username)
  if (!accountUid) throw new Error("Account not found")
  const row = getLobbyDb()
    .prepare(`SELECT Characters FROM Account WHERE UID = ?`)
    .get(accountUid) as { Characters: Uint8Array | Buffer | null } | undefined
  const occupiedSlots = countOccupiedSlots(row?.Characters)
  const freeSlots = Math.max(0, MAX_CHARACTER_SLOTS - occupiedSlots)
  if (opts.selections.length > freeSlots) {
    throw new Error(
      `Not enough character slots (need ${opts.selections.length}, free ${freeSlots})`
    )
  }

  return {
    parsed,
    registrationUserLevel: cfg.registrationUserLevel,
    freeSlots,
  }
}

export { BackupParseError, isKnownItem, isKnownDemon }
