import {
  collectUuidsFromElement,
  memberText,
  type BackupObject,
  type ParsedBackup,
} from "@/lib/character-import/parse-backup-xml"
import { NULL_UUID, type StripPreview } from "@/lib/character-import/types"

function isNullUuid(u: string | null | undefined): boolean {
  return !u || u.toLowerCase() === NULL_UUID
}

/**
 * Collect world objects owned by the given character UUIDs.
 * Excludes Account and account-shared depot boxes (Character empty/null).
 */
export function sliceCharacterGraphs(
  parsed: ParsedBackup,
  characterUuids: string[]
): { objects: BackupObject[]; skippedAccountDepotBoxes: number } {
  const wantedChars = new Set(characterUuids.map((u) => u.toLowerCase()))
  const include = new Set<string>()
  const queue: string[] = []

  for (const uuid of wantedChars) {
    if (parsed.byUuid.has(uuid)) {
      include.add(uuid)
      queue.push(uuid)
    }
  }

  // Reverse links: objects that name this Character
  for (const obj of parsed.objects) {
    if (obj.type === "Account") continue
    const charRef = memberText(obj.element, "Character")
    if (charRef && wantedChars.has(charRef.toLowerCase())) {
      if (!include.has(obj.uuid)) {
        include.add(obj.uuid)
        queue.push(obj.uuid)
      }
    }
  }

  let skippedAccountDepotBoxes = 0
  for (const obj of parsed.objects) {
    if (obj.type !== "ItemBox" && obj.type !== "DemonBox") continue
    const charRef = memberText(obj.element, "Character")
    if (isNullUuid(charRef)) {
      skippedAccountDepotBoxes += 1
    }
  }

  // BFS follow UUID refs within included objects (and newly discovered ones)
  while (queue.length) {
    const uid = queue.shift()!
    const obj = parsed.byUuid.get(uid)
    if (!obj) continue
    for (const ref of collectUuidsFromElement(obj.element)) {
      if (ref === NULL_UUID) continue
      if (ref === parsed.accountUuid) continue
      // Do not pull in other characters or their graphs
      const target = parsed.byUuid.get(ref)
      if (!target) continue
      if (target.type === "Account") continue
      if (target.type === "Character" && !wantedChars.has(ref)) continue
      if (
        (target.type === "ItemBox" || target.type === "DemonBox") &&
        isNullUuid(memberText(target.element, "Character"))
      ) {
        continue
      }
      if (!include.has(ref)) {
        include.add(ref)
        queue.push(ref)
      }
    }
  }

  const objects = parsed.objects.filter((o) => include.has(o.uuid))
  return { objects, skippedAccountDepotBoxes }
}

export function previewStripForCharacters(
  parsed: ParsedBackup,
  characterUuids: string[],
  isKnownItem: (type: number) => boolean,
  isKnownDemon: (type: number) => boolean
): StripPreview {
  const { objects, skippedAccountDepotBoxes } = sliceCharacterGraphs(
    parsed,
    characterUuids
  )
  const itemCounts = new Map<number, number>()
  const demonCounts = new Map<number, number>()

  for (const obj of objects) {
    if (obj.type === "Item") {
      const typeRaw = memberText(obj.element, "Type")
      const type = typeRaw != null ? Number(typeRaw) : NaN
      if (!Number.isFinite(type) || !isKnownItem(type)) {
        const key = Number.isFinite(type) ? type : -1
        itemCounts.set(key, (itemCounts.get(key) ?? 0) + 1)
      }
    }
    if (obj.type === "Demon") {
      const typeRaw = memberText(obj.element, "Type")
      const type = typeRaw != null ? Number(typeRaw) : NaN
      if (!Number.isFinite(type) || !isKnownDemon(type)) {
        const key = Number.isFinite(type) ? type : -1
        demonCounts.set(key, (demonCounts.get(key) ?? 0) + 1)
      }
    }
  }

  return {
    unknownItems: [...itemCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => a.type - b.type),
    unknownDemons: [...demonCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => a.type - b.type),
    skippedAccountDepotBoxes,
  }
}
