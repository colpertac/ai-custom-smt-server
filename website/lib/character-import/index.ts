import "server-only"

import {
  attachImportedCharacters,
  rollbackEphemeralImport,
} from "@/lib/character-import/attach"
import { buildSanitizedImportXml } from "@/lib/character-import/sanitize"
import {
  isKnownDemon,
  isKnownItem,
  validateSelections,
} from "@/lib/character-import/service"
import { clearStagedBackup, readStagedBackup } from "@/lib/character-import/staging"
import type {
  CharacterImportResult,
  CharacterImportSelection,
} from "@/lib/character-import/types"
import { importAccountXml } from "@/lib/comp-import"

export async function confirmCharacterImport(opts: {
  username: string
  uploadToken: string
  selections: CharacterImportSelection[]
}): Promise<CharacterImportResult> {
  const staged = readStagedBackup(opts.username, opts.uploadToken)
  const { parsed, registrationUserLevel } = await validateSelections({
    username: opts.username,
    xml: staged.xml,
    selections: opts.selections,
  })

  const sanitized = buildSanitizedImportXml(parsed, {
    selections: opts.selections,
    registrationUserLevel,
    isKnownItem,
    isKnownDemon,
  })

  const blob = new Blob([sanitized.xml], { type: "application/xml" })
  const lobbyResult = await importAccountXml(
    blob,
    `${sanitized.ephemeralUsername}.xml`
  )
  if (!lobbyResult.ok) {
    throw new Error(lobbyResult.message || "Lobby import failed")
  }

  try {
    attachImportedCharacters({
      destinationUsername: opts.username,
      ephemeralUsername: sanitized.ephemeralUsername,
      characterUuids: sanitized.characterUuids,
    })
  } catch (err) {
    rollbackEphemeralImport({
      ephemeralUsername: sanitized.ephemeralUsername,
      characterUuids: sanitized.characterUuids,
    })
    throw err
  }

  clearStagedBackup(opts.username, opts.uploadToken)

  return {
    imported: sanitized.imported,
    strippedItems: sanitized.strippedItems,
    strippedDemons: sanitized.strippedDemons,
    skippedAccountDepotBoxes: sanitized.skippedAccountDepotBoxes,
  }
}
