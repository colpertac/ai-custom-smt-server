import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import {
  getItemSourceEntry,
  getSpawnsByEnemyType,
  loadItemSourcesPayload,
  type ItemDropSource,
  type ItemSourceEntry,
} from "@/lib/item-sources-load"
import {
  getQuestById,
  getQuestNpcLinks,
  knowledgeQuestsDir,
  loadQuestNpcsPayload,
  loadQuestsPayload,
  type QuestNpcRow,
  type QuestRecord,
} from "@/lib/quest-catalog-load"
import { loadWikiItemsPayload } from "@/lib/wiki-catalog-load"
import { zoneLabel, ZONE_NAMES } from "@/lib/zone-names"

export type AskCitation = {
  kind:
    | "quests"
    | "quest-npcs"
    | "knowledge"
    | "event"
    | "item-sources"
    | "spawns"
  label: string
  ref: string
}

export type AskMatch = {
  id: number
  title: string
  score: number
}

export type AskRetrievalResult = {
  ok: boolean
  answer: string
  citations: AskCitation[]
  matches: AskMatch[]
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "can",
  "complete",
  "do",
  "does",
  "drop",
  "drops",
  "enemies",
  "enemy",
  "farm",
  "find",
  "finish",
  "from",
  "get",
  "how",
  "i",
  "in",
  "is",
  "item",
  "loot",
  "my",
  "obtain",
  "of",
  "start",
  "the",
  "to",
  "where",
  "what",
  "when",
  "which",
  "who",
  "why",
  "with",
  "quest",
  "q",
])

const QDETAIL_RX = /<qdetail:([^>]+)>\n?/g

const QUEST_ID_RX =
  /\b(?:quest|q)\s*#?\s*(\d{1,5})\b|\bquest\s+id\s*(\d{1,5})\b/i

/** Phrasings that mean “where does this item come from?” (wiki-replacement Ask). */
const ITEM_ACQUISITION_RX =
  /\b(?:where\s+(?:do\s+i\s+|to\s+|can\s+i\s+)?(?:get|find|farm|obtain)|how\s+(?:do\s+i\s+|to\s+|can\s+i\s+)?(?:get|find|farm|obtain)|(?:what|which)\s+enemies?\s+(?:drop|have|give)|(?:who|what)\s+drops?|(?:enemies?|mobs?)\s+(?:that\s+)?drop|drop(?:s|ped)?\s+(?:from|by)|farm(?:ing)?)\b/i

const ITEM_QUERY_PREFIX_RX =
  /^(?:where\s+(?:do\s+i\s+|to\s+|can\s+i\s+)?(?:get|find|farm|obtain)|how\s+(?:do\s+i\s+|to\s+|can\s+i\s+)?(?:get|find|farm|obtain)|(?:what|which)\s+enemies?\s+(?:drop|have|give)|(?:who|what)\s+drops?|(?:enemies?|mobs?)\s+(?:that\s+)?drop|drop(?:s|ped)?\s+(?:from|by)|farm(?:ing)?)\s+/i

const MAX_ITEM_DROPS_SHOWN = 8

type ItemRequirement = {
  objectID: number
  objectCount: number
}

type ItemMatch = {
  id: number
  name: string
  score: number
}

function normalizeText(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .toLowerCase()
    .replace(/[''']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
}

function parseQuestIdFromQuery(query: string): number | null {
  const m = query.match(QUEST_ID_RX)
  if (!m) return null
  const raw = m[1] ?? m[2]
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

function parseJournalLine(raw: string): { text: string; imageRefs: string[] } {
  const imageRefs: string[] = []
  let text = raw ?? ""
  text = text.replace(QDETAIL_RX, (_full, ref: string) => {
    imageRefs.push(ref)
    return ""
  })
  return { text: text.trim(), imageRefs }
}

function scoreQuest(query: string, quest: QuestRecord): number {
  const parsedId = parseQuestIdFromQuery(query)
  if (parsedId != null && parsedId === quest.id) {
    return 1000
  }

  let score = 0
  const queryNorm = normalizeText(query)
  const titleNorm = normalizeText(quest.title ?? "")
  const queryTokens = tokenize(query)
  const titleTokens = new Set(tokenize(quest.title ?? ""))

  if (titleNorm && queryNorm.includes(titleNorm)) {
    score += 500
  }

  if (queryTokens.length > 0) {
    const matched = queryTokens.filter((t) => titleTokens.has(t))
    if (matched.length === queryTokens.length && matched.length > 0) {
      score += 400 + matched.length * 10
    } else {
      for (const token of matched) {
        score += token.length >= 4 ? 12 : 6
      }
    }
  }

  if (quest.npc) {
    const npcNorm = normalizeText(quest.npc)
    const npcTokens = new Set(tokenize(quest.npc))
    if (npcNorm && queryNorm.includes(npcNorm)) {
      score += 80
    }
    for (const token of queryTokens) {
      if (npcTokens.has(token)) score += 8
    }
  }

  if (queryNorm.includes(String(quest.id))) {
    score += 50
  }

  return score
}

function isItemAcquisitionQuery(query: string): boolean {
  return ITEM_ACQUISITION_RX.test(query)
}

function stripItemQueryPrefix(query: string): string {
  return query.replace(ITEM_QUERY_PREFIX_RX, "").replace(/\?+$/, "").trim()
}

function scoreItemMatch(query: string, itemId: number, itemName: string): number {
  const queryNorm = normalizeText(query)
  const stripped = stripItemQueryPrefix(query)
  const strippedNorm = normalizeText(stripped)
  const nameNorm = normalizeText(itemName)

  if (!nameNorm) return 0

  let score = 0
  if (strippedNorm && strippedNorm === nameNorm) {
    score += 900
  } else if (strippedNorm && nameNorm.includes(strippedNorm)) {
    score += 600 + Math.min(strippedNorm.length, 40)
  } else if (strippedNorm && strippedNorm.includes(nameNorm)) {
    score += 550 + Math.min(nameNorm.length, 40)
  } else if (queryNorm.includes(nameNorm)) {
    score += 500 + Math.min(nameNorm.length, 40)
  }

  const queryTokens = tokenize(strippedNorm || queryNorm)
  const nameTokens = new Set(tokenize(itemName))
  if (queryTokens.length > 0) {
    const matched = queryTokens.filter((t) => nameTokens.has(t))
    if (matched.length === queryTokens.length && matched.length > 0) {
      score += 350 + matched.length * 12
    } else {
      for (const token of matched) {
        score += token.length >= 4 ? 14 : 7
      }
    }
  }

  if (queryNorm.includes(String(itemId))) {
    score += 80
  }

  return score
}

export function matchItemFromQuery(query: string): ItemMatch | null {
  const { data: itemsPayload } = loadWikiItemsPayload()
  let best: ItemMatch | null = null
  for (const item of itemsPayload.items) {
    const score = scoreItemMatch(query, item.id, item.name)
    if (score <= 0) continue
    if (!best || score > best.score || (score === best.score && item.id < best.id)) {
      best = { id: item.id, name: item.name, score }
    }
  }
  return best
}

function dropSignature(drop: ItemDropSource): string {
  return [
    drop.kind,
    drop.zoneId ?? 0,
    drop.enemyType ?? 0,
    drop.spawnId ?? 0,
    drop.dropSetId ?? 0,
  ].join(":")
}

function pickTopDrops(
  drops: ItemDropSource[],
  limit = MAX_ITEM_DROPS_SHOWN
): ItemDropSource[] {
  const sorted = [...drops].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
  const picked: ItemDropSource[] = []
  const seenZoneKind = new Set<string>()

  for (const drop of sorted) {
    const zoneKind = `${drop.kind}:${drop.zoneId ?? 0}`
    if (seenZoneKind.has(zoneKind)) continue
    seenZoneKind.add(zoneKind)
    picked.push(drop)
    if (picked.length >= limit) return picked
  }

  const seen = new Set(picked.map(dropSignature))
  for (const drop of sorted) {
    const sig = dropSignature(drop)
    if (seen.has(sig)) continue
    seen.add(sig)
    picked.push(drop)
    if (picked.length >= limit) return picked
  }

  return picked
}

function dropKindLabel(kind: string): string {
  switch (kind) {
    case "plasma":
      return "plasma node"
    case "enemyGift":
    case "enemyGiftInline":
      return "enemy gift"
    case "enemyInline":
      return "inline enemy drop"
    default:
      return "enemy drop"
  }
}

function formatDropBullet(drop: ItemDropSource): string {
  const zone = zoneLabel(drop.zoneId)
  const rate =
    drop.rate != null && Number.isFinite(drop.rate) ? `${drop.rate}%` : "?"
  let line = `**${zone}** — ${dropKindLabel(drop.kind)}`
  if (drop.enemyType != null) {
    line += ` (enemy type ${drop.enemyType})`
  }
  line += ` · ${rate}`
  if (drop.minStack != null || drop.maxStack != null) {
    const min = drop.minStack ?? drop.maxStack
    const max = drop.maxStack ?? drop.minStack
    if (min === max) line += ` · stack ${min}`
    else line += ` · stack ${min}–${max}`
  }
  return `- ${line}`
}

function questItemRequirements(quest: QuestRecord): ItemRequirement[] {
  const byId = new Map<number, number>()
  for (const phase of quest.phases ?? []) {
    for (const req of phase.requirements ?? []) {
      if (
        typeof req !== "object" ||
        req === null ||
        (req as { type?: string }).type !== "ITEM"
      ) {
        continue
      }
      const row = req as {
        type: string
        objectID?: number
        objectCount?: number
      }
      const objectID = row.objectID
      if (objectID == null || objectID <= 0) continue
      const count = row.objectCount ?? 1
      byId.set(objectID, Math.max(byId.get(objectID) ?? 0, count))
    }
  }
  return [...byId.entries()].map(([objectID, objectCount]) => ({
    objectID,
    objectCount,
  }))
}

function wikiItemName(itemId: number): string {
  const { data } = loadWikiItemsPayload()
  return data.items.find((item) => item.id === itemId)?.name ?? `Item ${itemId}`
}

function buildItemSourceSection(
  itemId: number,
  itemName: string,
  entry: ItemSourceEntry | undefined,
  options?: { heading?: string; countNote?: number }
): { lines: string[]; citations: AskCitation[] } {
  const lines: string[] = []
  const citations: AskCitation[] = []
  if (!entry || !(entry.drops?.length ?? 0)) {
    return { lines, citations }
  }

  const heading =
    options?.heading ??
    `### ${itemName}${options?.countNote ? ` ×${options.countNote}` : ""}`
  lines.push(heading)
  for (const drop of pickTopDrops(entry.drops)) {
    lines.push(formatDropBullet(drop))
    if (drop.enemyType != null && getSpawnsByEnemyType(drop.enemyType)) {
      citations.push({
        kind: "spawns",
        label: `Enemy type ${drop.enemyType} spawns`,
        ref: `website/content/wiki/spawns.json#enemy-${drop.enemyType}`,
      })
    }
  }
  lines.push("")

  citations.push({
    kind: "item-sources",
    label: `${itemName} (item ${itemId})`,
    ref: `website/content/wiki/item-sources.json#${itemId}`,
  })

  return { lines, citations }
}

function appendQuestItemSources(
  quest: QuestRecord,
  lines: string[],
  citations: AskCitation[]
): void {
  const requirements = questItemRequirements(quest)
  if (!requirements.length || !loadItemSourcesPayload()) return

  const sections: string[] = []
  for (const req of requirements) {
    const itemName = wikiItemName(req.objectID)
    const entry = getItemSourceEntry(req.objectID)
    const section = buildItemSourceSection(req.objectID, itemName, entry, {
      countNote: req.objectCount,
    })
    if (section.lines.length) {
      sections.push(...section.lines)
      citations.push(...section.citations)
    }
  }

  if (!sections.length) return

  lines.push("## Where to get quest items")
  lines.push("")
  lines.push(...sections)
}

function synthesizeItemAcquisitionAnswer(
  itemId: number,
  itemName: string
): { answer: string; citations: AskCitation[] } | null {
  const entry = getItemSourceEntry(itemId)
  const section = buildItemSourceSection(itemId, itemName, entry)
  if (!section.lines.length) return null

  const payload = loadItemSourcesPayload()
  const lines: string[] = []
  lines.push(`# Where to get **${itemName}**`)
  lines.push("")
  lines.push(`Item ID **${itemId}**.`)
  lines.push("")
  lines.push("## Drop / plasma sources")
  lines.push("")
  lines.push(...section.lines)

  lines.push("## Data sources")
  lines.push("")
  lines.push(`- \`item-sources.json\` item ${itemId}`)
  if (payload?.generatedAt) {
    lines.push(`  - generated ${payload.generatedAt}`)
  }

  return {
    answer: lines.join("\n").trim() + "\n",
    citations: section.citations,
  }
}

export function searchQuests(query: string, limit = 5): AskMatch[] {
  const quests = loadQuestsPayload().quests
  const scored = quests
    .map((quest) => ({
      id: quest.id,
      title: quest.title,
      score: scoreQuest(query, quest),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.id - b.id)

  return scored.slice(0, limit)
}

function findKnowledgeNote(questId: number): { path: string; body: string } | null {
  const dir = knowledgeQuestsDir()
  if (!existsSync(dir)) return null
  const prefix = String(questId).padStart(3, "0")
  const file = readdirSync(dir).find(
    (name) => name.startsWith(`${prefix}-`) && name.endsWith(".md")
  )
  if (!file) return null
  const fullPath = path.join(dir, file)
  try {
    return {
      path: `website/knowledge/quests/${file}`,
      body: readFileSync(fullPath, "utf-8").trim(),
    }
  } catch {
    return null
  }
}

function enrichNpcRow(row: QuestNpcRow): QuestNpcRow & {
  zoneName?: string
  zoneLabel: string
} {
  const zoneID = row.zoneID
  return {
    ...row,
    zoneName: zoneID != null ? ZONE_NAMES[zoneID] : undefined,
    zoneLabel: zoneLabel(zoneID),
  }
}

function npcBullet(row: QuestNpcRow & { zoneLabel?: string }): string {
  const name = row.npcName || "Unknown NPC"
  const npcId = row.npcId
  const zone = row.zoneLabel ?? zoneLabel(row.zoneID)
  let line = `**${name}**`
  if (npcId != null) line += ` (NPC ${npcId})`
  line += ` — ${zone}`
  if (row.eventId) line += ` · event \`${row.eventId}\``
  return line
}

function synthesizeQuestAnswer(quest: QuestRecord): {
  answer: string
  citations: AskCitation[]
} {
  const links = getQuestNpcLinks(quest.id)
  const startRows = links.start.map(enrichNpcRow)
  const advanceRows = links.advance.map(enrichNpcRow)
  const completeRows = links.complete.map(enrichNpcRow)
  const advanceByPhase = new Map<number, ReturnType<typeof enrichNpcRow>>()
  for (const row of advanceRows) {
    if (typeof row.phase === "number" && row.phase > 0) {
      advanceByPhase.set(row.phase, row)
    }
  }

  const questsPayload = loadQuestsPayload()
  const questNpcsPayload = loadQuestNpcsPayload()

  const lines: string[] = []
  lines.push(`# ${quest.title}`)
  lines.push("")
  lines.push(`Quest ID **${quest.id}** · type \`${quest.type}\``)

  const giverName = quest.npc ?? startRows[0]?.npcName
  const giverNpcId = startRows[0]?.npcId
  if (giverName) {
    lines.push(
      `Start in **${zoneLabel(quest.zoneID)}** with **${giverName}**` +
        (giverNpcId != null ? ` (NPC ${giverNpcId})` : "") +
        "."
    )
  }
  lines.push("")

  if (startRows.length || advanceRows.length || completeRows.length) {
    lines.push("## NPCs (from event graph)")
    lines.push("")
    if (startRows.length) {
      lines.push("**Start**")
      for (const row of startRows) lines.push(`- ${npcBullet(row)}`)
      lines.push("")
    }
    if (advanceRows.length) {
      lines.push("**Advance (by phase)**")
      for (const row of advanceRows) {
        const phaseNote =
          row.phase != null ? `phase ${row.phase}: ` : ""
        lines.push(`- ${phaseNote}${npcBullet(row)}`)
      }
      lines.push("")
    }
    if (completeRows.length) {
      lines.push("**Complete**")
      for (const row of completeRows) lines.push(`- ${npcBullet(row)}`)
      lines.push("")
    }
  }

  const rawLines = quest.lines ?? []
  if (rawLines.length) {
    lines.push("## Steps")
    lines.push("")
    for (let idx = 0; idx < rawLines.length; idx++) {
      const stepNum = idx + 1
      const parsed = parseJournalLine(rawLines[idx]!)
      lines.push(`${stepNum}. ${parsed.text.replace(/\n/g, " ")}`)
      if (parsed.imageRefs.length) {
        lines.push(
          `   - *(Journal image: ${parsed.imageRefs.join(", ")})*`
        )
      }
      const npcHint = advanceByPhase.get(stepNum)
      if (npcHint?.npcName) {
        lines.push(
          `   - Talk to **${npcHint.npcName}** (NPC ${npcHint.npcId}) in ${npcHint.zoneLabel}.`
        )
      }
      lines.push("")
    }
  }

  const phases = quest.phases ?? []
  if (
    phases.length > 0 &&
    phases.every((p) => !(p.requirements?.length ?? 0))
  ) {
    lines.push(
      "> All phases are dialogue-driven (no kill/collect counters in QuestData). " +
        "Progress by talking to the NPCs above."
    )
    lines.push("")
  }

  lines.push("## Data sources")
  lines.push("")
  lines.push(
    `- \`quests.json\` id ${quest.id}` +
      (questsPayload.generatedAt
        ? ` (generated ${questsPayload.generatedAt})`
        : "")
  )
  lines.push(
    "- `quest-npcs.json` ActionUpdateQuest events" +
      (questNpcsPayload.generatedAt
        ? ` (generated ${questNpcsPayload.generatedAt})`
        : "")
  )

  const citations: AskCitation[] = [
    {
      kind: "quests",
      label: `Quest ${quest.id}: ${quest.title}`,
      ref: `website/content/wiki/quests.json#${quest.id}`,
    },
    {
      kind: "quest-npcs",
      label: `Quest ${quest.id} NPC graph`,
      ref: `website/content/wiki/quest-npcs.json#${quest.id}`,
    },
  ]

  for (const row of [...startRows, ...advanceRows, ...completeRows]) {
    if (row.eventId) {
      citations.push({
        kind: "event",
        label: row.eventId,
        ref: row.sourceFile
          ? `${row.sourceFile} · ${row.eventId}`
          : row.eventId,
      })
    }
  }

  return { answer: lines.join("\n").trim() + "\n", citations }
}

const NOT_IN_CATALOG =
  "That topic is **not in the quest or item catalog** yet. Try a quest title " +
  "(`how do I complete …`), an item name (`what enemies drop …` / `how do I get …`), " +
  "NPC name, or `quest 123` — I only answer from exported server data, not general SMT lore."

/** Minimum score for a quest title/token match (direct id match always wins). */
const MATCH_THRESHOLD = 10

/** Minimum score for an item name match on acquisition-style queries. */
const ITEM_MATCH_THRESHOLD = 50

/** Strong enough bare item-name hit to prefer drops over a weak quest coincidence. */
const STRONG_ITEM_NAME_SCORE = 500

export function retrieveAskAnswer(query: string): AskRetrievalResult {
  const trimmed = query.trim()
  if (!trimmed) {
    return {
      ok: false,
      answer:
        "Please enter a question about a quest or item (e.g. how to complete a quest, or what drops an item).",
      citations: [],
      matches: [],
    }
  }

  const matches = searchQuests(trimmed, 5)
  const top = matches[0]
  const itemQuery = isItemAcquisitionQuery(trimmed)
  const itemMatch = matchItemFromQuery(trimmed)
  const itemScore = itemMatch?.score ?? 0
  const itemEligible =
    itemMatch != null &&
    itemScore >= ITEM_MATCH_THRESHOLD &&
    (itemQuery || itemScore >= STRONG_ITEM_NAME_SCORE)
  const itemAnswer = itemEligible
    ? synthesizeItemAcquisitionAnswer(itemMatch!.id, itemMatch!.name)
    : null

  const questStrongEnough = !!top && top.score >= MATCH_THRESHOLD
  const itemPreferred =
    itemAnswer != null &&
    (!questStrongEnough || itemScore >= (top?.score ?? 0) || itemQuery)

  if (itemPreferred && itemAnswer) {
    return {
      ok: true,
      answer: itemAnswer.answer,
      citations: itemAnswer.citations,
      matches,
    }
  }

  if (!questStrongEnough) {
    return {
      ok: false,
      answer: NOT_IN_CATALOG,
      citations: [],
      matches,
    }
  }

  const quest = getQuestById(top!.id)
  if (!quest) {
    return {
      ok: false,
      answer: NOT_IN_CATALOG,
      citations: [],
      matches,
    }
  }

  const knowledge = findKnowledgeNote(quest.id)
  if (knowledge) {
    const citations: AskCitation[] = [
      {
        kind: "knowledge",
        label: `Reviewed note: ${quest.title}`,
        ref: knowledge.path,
      },
      {
        kind: "quests",
        label: `Quest ${quest.id}: ${quest.title}`,
        ref: `website/content/wiki/quests.json#${quest.id}`,
      },
      {
        kind: "quest-npcs",
        label: `Quest ${quest.id} NPC graph`,
        ref: `website/content/wiki/quest-npcs.json#${quest.id}`,
      },
    ]

    const links = getQuestNpcLinks(quest.id)
    for (const row of [
      ...links.start,
      ...links.advance,
      ...links.complete,
    ]) {
      if (row.eventId) {
        citations.push({
          kind: "event",
          label: row.eventId,
          ref: row.sourceFile
            ? `${row.sourceFile} · ${row.eventId}`
            : row.eventId,
        })
      }
    }

    const knowledgeLines = knowledge.body.split("\n")
    appendQuestItemSources(quest, knowledgeLines, citations)

    return {
      ok: true,
      answer: knowledgeLines.join("\n").trim() + "\n",
      citations,
      matches,
    }
  }

  const synthesized = synthesizeQuestAnswer(quest)
  const answerLines = synthesized.answer.split("\n")
  appendQuestItemSources(quest, answerLines, synthesized.citations)
  return {
    ok: true,
    answer: answerLines.join("\n").trim() + "\n",
    citations: synthesized.citations,
    matches,
  }
}
