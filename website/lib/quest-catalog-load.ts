import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import bakedQuestGuides from "@/content/wiki/quest-guides.json"
import bakedQuestNpcs from "@/content/wiki/quest-npcs.json"
import bakedQuests from "@/content/wiki/quests.json"
import { resolveWikiRuntimeRoot } from "@/lib/wiki-catalog-load"
import type { WikiQuestSearchHit } from "@/lib/wiki-quest-search"
import { zoneLabel } from "@/lib/zone-names"

export type QuestPhaseRequirement = {
  type?: string
  objectID?: number
  objectCount?: number
}

export type QuestPhase = {
  phaseNumber: number
  requirementCount: number
  requirements: QuestPhaseRequirement[]
}

export type QuestStartClause = {
  type?: string
  value1?: number
  value2?: number
}

export type QuestStartCondition = {
  clauseCount?: number
  clauses?: QuestStartClause[]
}

export type QuestNextLink = {
  questID?: number
  restrictionType?: number
  restrictionValue?: number
}

export type QuestRecord = {
  id: number
  title: string | null
  npc: string | null
  zoneID: number
  coordinates?: { x: number; y: number }
  lines: string[]
  type: string
  groupID?: number
  episodeType?: string
  bonusEnabled?: boolean
  startConditions?: QuestStartCondition[]
  restrictionText?: string | null
  phaseCount?: number
  phases: QuestPhase[]
  nextQuests?: QuestNextLink[]
}

export type QuestsPayload = {
  source?: string
  generatedAt?: string
  note?: string
  quests: QuestRecord[]
}

export type QuestNpcRow = {
  npcId?: number
  npcName?: string
  zoneID?: number
  eventId?: string
  phase?: number
  sourceFile?: string
}

export type QuestNpcLinks = {
  start: QuestNpcRow[]
  advance: QuestNpcRow[]
  complete: QuestNpcRow[]
}

export type QuestNpcsPayload = {
  generatedAt?: string
  byQuestId: Record<string, QuestNpcLinks>
}

export type QuestGuideCondition = {
  type: string
  value1?: number
  value2?: number
  compareMode?: string
  negate?: boolean
}

export type QuestGuideCount = { id: number; count: number }

export type QuestGuideAction =
  | { type: "items"; items: QuestGuideCount[]; mode?: string }
  | { type: "xp"; amount: number; target: string }
  | { type: "lnc"; value: number; set: boolean }
  | {
      type: "skills"
      skills: number[]
      expertise?: { id: number; points: number }[]
      target?: string
    }
  | { type: "points"; pointType: string; value: number; set: boolean }
  | { type: "flag"; flagType: string; id: number; remove: boolean }
  | {
      type: "demons"
      add: QuestGuideCount[]
      remove: QuestGuideCount[]
      chosen?: boolean
    }
  | { type: "zone"; zoneID: number }
  | { type: "homepoint"; zoneID?: number | null }
  | { type: "quest"; questID: number; phase: number }

export type QuestGuideTrigger = {
  kind: "npc" | "object" | "spot" | "defeat" | "zone" | "event"
  zoneID?: number | null
  npcId?: number
  objectId?: number
  spotId?: number
  trigger?: string | null
  /** In-game map grid [X, Y] (ops MapGrid), when the zone has a map. */
  grid?: number[]
}

export type QuestGuideDialogueLine = {
  who: "npc" | "you" | "system" | "scene"
  text: string
}

export type QuestGuideStep = {
  phase: number
  eventId: string
  file?: string
  trigger: QuestGuideTrigger
  conditions?: QuestGuideCondition[]
  choices?: string[]
  fights?: {
    zoneID?: number | null
    enemies: { type: number; count: number }[]
  }[]
  actions?: QuestGuideAction[]
  dialogue?: QuestGuideDialogueLine[]
  /** Multi-conversation steps (quest-flag puzzles), in order. */
  sequence?: QuestGuideTalk[]
}

export type QuestGuideTalk = {
  trigger: QuestGuideTrigger
  choices: string[]
  items?: QuestGuideCount[]
  /** This conversation has a random outcome (it decides the variant). */
  random?: boolean
}

export type QuestGuide = {
  id: number
  start: QuestGuideStep[]
  /** One entry per advance phase (ascending); each lists route variants. */
  phases: QuestGuideStep[][]
  complete: QuestGuideStep[]
  prerequisites?: number[]
  unlocks?: number[]
  levelMin?: number
}

export type QuestGuidesPayload = {
  source?: string
  generatedAt?: string
  note?: string
  stats?: Record<string, number>
  npcNames: Record<string, string>
  zoneNames: Record<string, string>
  byQuestId: Record<string, QuestGuide>
}

type CacheEntry<T> = {
  path: string | null
  mtimeMs: number
  data: T
}

let questsCache: CacheEntry<QuestsPayload> | null = null
let questNpcsCache: CacheEntry<QuestNpcsPayload> | null = null
let questGuidesCache: CacheEntry<QuestGuidesPayload> | null = null

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T
  } catch {
    return null
  }
}

function loadCached<T>(
  cache: CacheEntry<T> | null,
  filePath: string | null,
  baked: T
): CacheEntry<T> {
  if (!filePath || !existsSync(filePath)) {
    return { path: null, mtimeMs: 0, data: baked }
  }
  let mtimeMs = 0
  try {
    mtimeMs = statSync(filePath).mtimeMs
  } catch {
    return { path: null, mtimeMs: 0, data: baked }
  }
  if (cache && cache.path === filePath && cache.mtimeMs === mtimeMs) {
    return cache
  }
  const parsed = readJsonFile<T>(filePath)
  if (!parsed) {
    return { path: null, mtimeMs: 0, data: baked }
  }
  return { path: filePath, mtimeMs, data: parsed }
}

export function loadQuestsPayload(): QuestsPayload {
  const filePath = path.join(resolveWikiRuntimeRoot(), "wiki", "quests.json")
  questsCache = loadCached(questsCache, filePath, bakedQuests as QuestsPayload)
  return questsCache.data
}

export function loadQuestNpcsPayload(): QuestNpcsPayload {
  const filePath = path.join(
    resolveWikiRuntimeRoot(),
    "wiki",
    "quest-npcs.json"
  )
  questNpcsCache = loadCached(
    questNpcsCache,
    filePath,
    bakedQuestNpcs as QuestNpcsPayload
  )
  return questNpcsCache.data
}

/** Event-graph walkthroughs from ops/extract_quest_guides.py. */
export function loadQuestGuidesPayload(): QuestGuidesPayload {
  const filePath = path.join(
    resolveWikiRuntimeRoot(),
    "wiki",
    "quest-guides.json"
  )
  questGuidesCache = loadCached(
    questGuidesCache,
    filePath,
    bakedQuestGuides as QuestGuidesPayload
  )
  return questGuidesCache.data
}

export function getQuestGuide(questId: number): QuestGuide | undefined {
  return loadQuestGuidesPayload().byQuestId[String(questId)]
}

export function getQuestById(id: number): QuestRecord | undefined {
  return loadQuestsPayload().quests.find((q) => q.id === id)
}

export function getQuestNpcLinks(questId: number): QuestNpcLinks {
  const byId = loadQuestNpcsPayload().byQuestId
  const raw = byId[String(questId)] ?? byId[questId as unknown as string]
  return {
    start: [...(raw?.start ?? [])],
    advance: [...(raw?.advance ?? [])].sort(
      (a, b) => (a.phase ?? 0) - (b.phase ?? 0)
    ),
    complete: [...(raw?.complete ?? [])],
  }
}

/** Test helper — clear mtime caches. */
export function clearQuestCatalogCache(): void {
  questsCache = null
  questNpcsCache = null
  questGuidesCache = null
}

export function knowledgeQuestsDir(): string {
  return path.join(REPO_ROOT, "website", "knowledge", "quests")
}

/** Compact quest rows for wiki global search (server-only). */
export function listWikiQuestSearchIndex(): WikiQuestSearchHit[] {
  return loadQuestsPayload().quests.map((q) => ({
    id: q.id,
    title: q.title ?? `Quest ${q.id}`,
    type: q.type,
    npc: q.npc,
    zoneLabel: zoneLabel(q.zoneID),
  }))
}
