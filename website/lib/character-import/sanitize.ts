import { randomBytes, randomUUID } from "node:crypto"
import { XMLSerializer } from "@xmldom/xmldom"

import { sliceCharacterGraphs } from "@/lib/character-import/character-graph"
import {
  memberText,
  replaceUuidRefsInElement,
  setMemberText,
  type BackupObject,
  type ParsedBackup,
  type XmlElement,
} from "@/lib/character-import/parse-backup-xml"
import {
  MAX_CHARACTER_SLOTS,
  NULL_UUID,
  type CharacterImportSelection,
} from "@/lib/character-import/types"
import { passwordHash } from "@/lib/sha512"

export type SanitizeOptions = {
  selections: CharacterImportSelection[]
  registrationUserLevel: number
  isKnownItem: (type: number) => boolean
  isKnownDemon: (type: number) => boolean
}

export type SanitizeResult = {
  xml: string
  ephemeralUsername: string
  ephemeralAccountUuid: string
  characterUuids: string[]
  imported: { sourceName: string; newName: string; uuid: string }[]
  strippedItems: number
  strippedDemons: number
  skippedAccountDepotBoxes: number
}

const serializer = new XMLSerializer()

function cloneObject(obj: BackupObject): BackupObject {
  const cloned = obj.element.cloneNode?.(true) as XmlElement | undefined
  if (!cloned) {
    throw new Error("Failed to clone backup object")
  }
  return { type: obj.type, uuid: obj.uuid, element: cloned }
}

function buildEphemeralAccountXml(opts: {
  accountUuid: string
  username: string
  email: string
  passwordHex: string
  salt: string
  userLevel: number
  characterUuids: string[]
}): string {
  const slots = Array.from({ length: MAX_CHARACTER_SLOTS }, (_, i) =>
    opts.characterUuids[i] ?? NULL_UUID
  )
  const charsXml = slots
    .map((u) => `            <element>${u}</element>`)
    .join("\n")
  return `    <object name="Account">
        <member name="UUID">${opts.accountUuid}</member>
        <member name="Username"><![CDATA[${opts.username}]]></member>
        <member name="DisplayName"><![CDATA[${opts.username}]]></member>
        <member name="Email"><![CDATA[${opts.email}]]></member>
        <member name="Password"><![CDATA[${opts.passwordHex}]]></member>
        <member name="Salt"><![CDATA[${opts.salt}]]></member>
        <member name="CP">0</member>
        <member name="TicketCount">0</member>
        <member name="UserLevel">${opts.userLevel}</member>
        <member name="Enabled">true</member>
        <member name="APIOnly">false</member>
        <member name="LastLogin">0</member>
        <member name="LastLogout">0</member>
        <member name="BanReason"><![CDATA[]]></member>
        <member name="BanInitiator"><![CDATA[]]></member>
        <member name="Characters">
${charsXml}
        </member>
    </object>`
}

/**
 * Build a lobby-importable XML for selected characters only.
 * Remaps all UUIDs, strips unknown items/demons, ignores dump Account privileges.
 */
export function buildSanitizedImportXml(
  parsed: ParsedBackup,
  options: SanitizeOptions
): SanitizeResult {
  const bySourceName = new Map(
    parsed.characters.map((c) => [c.name, c] as const)
  )
  const selectedUuids: string[] = []
  const renameByOldUuid = new Map<string, string>()
  const importedMeta: {
    sourceName: string
    newName: string
    oldUuid: string
  }[] = []

  for (const sel of options.selections) {
    const src = bySourceName.get(sel.sourceName)
    if (!src) {
      throw new Error(`Character "${sel.sourceName}" not found in dump`)
    }
    const newName = sel.newName.trim()
    if (!newName) {
      throw new Error(`Missing new name for "${sel.sourceName}"`)
    }
    selectedUuids.push(src.uuid)
    renameByOldUuid.set(src.uuid.toLowerCase(), newName)
    importedMeta.push({
      sourceName: sel.sourceName,
      newName,
      oldUuid: src.uuid.toLowerCase(),
    })
  }

  const { objects: sliced, skippedAccountDepotBoxes } = sliceCharacterGraphs(
    parsed,
    selectedUuids
  )

  let workObjects = sliced.map(cloneObject)

  const badItemUuids = new Set<string>()
  const badDemonUuids = new Set<string>()
  for (const obj of workObjects) {
    if (obj.type === "Item") {
      const type = Number(memberText(obj.element, "Type"))
      if (!Number.isFinite(type) || !options.isKnownItem(type)) {
        badItemUuids.add(obj.uuid)
      }
    }
    if (obj.type === "Demon") {
      const type = Number(memberText(obj.element, "Type"))
      if (!Number.isFinite(type) || !options.isKnownDemon(type)) {
        badDemonUuids.add(obj.uuid)
      }
    }
  }

  const dropUuids = new Set([...badItemUuids, ...badDemonUuids])
  for (const obj of workObjects) {
    if (obj.type === "InheritedSkill") {
      const demon = memberText(obj.element, "Demon")?.toLowerCase()
      if (demon && badDemonUuids.has(demon)) {
        dropUuids.add(obj.uuid)
      }
    }
  }
  for (const demonObj of workObjects) {
    if (demonObj.type !== "Demon" || !badDemonUuids.has(demonObj.uuid)) continue
    const stats = memberText(demonObj.element, "CoreStats")?.toLowerCase()
    if (stats && stats !== NULL_UUID) dropUuids.add(stats)
    for (const equip of [
      ...(memberText(demonObj.element, "EquippedItems")
        ? []
        : []),
    ]) {
      void equip
    }
  }

  // Drop equipment items hanging only on bad demons (already in badItemUuids if unknown;
  // known items on bad demons: still drop the demon but keep items only if referenced elsewhere —
  // simplest: null demon equip slots via remap-to-null when dropping demon uuid refs)

  workObjects = workObjects.filter((o) => !dropUuids.has(o.uuid))

  const nullOut = new Map<string, string>()
  for (const u of dropUuids) {
    nullOut.set(u, NULL_UUID)
  }
  for (const obj of workObjects) {
    replaceUuidRefsInElement(obj.element, nullOut)
  }

  for (const obj of workObjects) {
    if (obj.type !== "Character") continue
    const newName = renameByOldUuid.get(obj.uuid.toLowerCase())
    if (newName) {
      setMemberText(obj.element, "Name", newName, true)
    }
  }

  const ephemeralAccountUuid = randomUUID()
  const ephemeralUsername = `imp_${randomBytes(8).toString("hex")}`
  const salt = randomBytes(5).toString("hex")
  const passwordHex = passwordHash(randomBytes(24).toString("hex"), salt)
  const email = `${ephemeralUsername}@import.invalid`

  const remap = new Map<string, string>()
  for (const obj of workObjects) {
    remap.set(obj.uuid.toLowerCase(), randomUUID())
  }
  if (parsed.accountUuid) {
    remap.set(parsed.accountUuid.toLowerCase(), ephemeralAccountUuid)
  }

  for (const obj of workObjects) {
    replaceUuidRefsInElement(obj.element, remap)
    const newUid = remap.get(obj.uuid.toLowerCase())
    if (newUid) {
      setMemberText(obj.element, "UUID", newUid)
      obj.uuid = newUid
    }
    if (memberText(obj.element, "Account") != null) {
      setMemberText(obj.element, "Account", ephemeralAccountUuid)
    }
  }

  const remappedChars: string[] = []
  const imported: SanitizeResult["imported"] = []
  for (const meta of importedMeta) {
    const newUuid = remap.get(meta.oldUuid)
    if (!newUuid) {
      throw new Error(`Failed to remap character ${meta.sourceName}`)
    }
    remappedChars.push(newUuid)
    imported.push({
      sourceName: meta.sourceName,
      newName: meta.newName,
      uuid: newUuid,
    })
  }

  const accountXml = buildEphemeralAccountXml({
    accountUuid: ephemeralAccountUuid,
    username: ephemeralUsername,
    email,
    passwordHex,
    salt,
    userLevel: Math.max(0, Math.min(1000, options.registrationUserLevel | 0)),
    characterUuids: remappedChars,
  })

  const body = workObjects
    .map((o) => serializer.serializeToString(o.element as never))
    .join("\n")

  const xml = `<objects>\n${accountXml}\n${body}\n</objects>\n`

  return {
    xml,
    ephemeralUsername,
    ephemeralAccountUuid,
    characterUuids: remappedChars,
    imported,
    strippedItems: badItemUuids.size,
    strippedDemons: badDemonUuids.size,
    skippedAccountDepotBoxes,
  }
}
