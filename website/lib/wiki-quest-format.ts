import type { QuestPhaseRequirement } from "@/lib/quest-catalog-load"
import {
  loadDevilsPayload,
  loadWikiItemsPayload,
} from "@/lib/wiki-catalog-load"

function devilDisplayName(type: number): string {
  return loadDevilsPayload().data.names[String(type)] ?? `Demon ${type}`
}

const QDETAIL_RX = /<qdetail:([^>]+)>\n?/g

export function parseQuestJournalLine(raw: string): {
  text: string
  imageRefs: string[]
} {
  const imageRefs: string[] = []
  let text = raw ?? ""
  text = text.replace(QDETAIL_RX, (_full, ref: string) => {
    imageRefs.push(ref)
    return ""
  })
  return { text: text.trim(), imageRefs }
}

export function wikiItemDisplayName(itemId: number): string {
  const { data } = loadWikiItemsPayload()
  return data.items.find((item) => item.id === itemId)?.name ?? `Item ${itemId}`
}

export type FormattedQuestRequirement = {
  kind: string
  label: string
  href?: string
  count?: number
  objectId?: number
}

export function formatQuestRequirement(
  req: QuestPhaseRequirement
): FormattedQuestRequirement | null {
  const type = (req.type ?? "NONE").toUpperCase()
  if (type === "NONE" || !type) return null
  const objectID = req.objectID
  const count = req.objectCount

  switch (type) {
    case "KILL":
    case "KILL_HIDDEN": {
      if (objectID == null || objectID <= 0) {
        return {
          kind: type,
          label: type === "KILL_HIDDEN" ? "Hidden kill" : "Kill",
        }
      }
      const name = devilDisplayName(objectID)
      return {
        kind: type,
        label:
          type === "KILL_HIDDEN" ? `Defeat (hidden) ${name}` : `Defeat ${name}`,
        href: `/wiki/demons/${objectID}`,
        count,
        objectId: objectID,
      }
    }
    case "ITEM": {
      if (objectID == null || objectID <= 0) {
        return { kind: type, label: "Collect item" }
      }
      const name = wikiItemDisplayName(objectID)
      return {
        kind: type,
        label: `Collect ${name}`,
        href: `/wiki/items/${objectID}`,
        count,
        objectId: objectID,
      }
    }
    case "SUMMON": {
      if (objectID == null || objectID <= 0) {
        return { kind: type, label: "Summon" }
      }
      const name = devilDisplayName(objectID)
      return {
        kind: type,
        label: `Summon ${name}`,
        href: `/wiki/demons/${objectID}`,
        count,
        objectId: objectID,
      }
    }
    default:
      return {
        kind: type,
        label: objectID != null ? `${type} #${objectID}` : type,
        count,
        objectId: objectID,
      }
  }
}
