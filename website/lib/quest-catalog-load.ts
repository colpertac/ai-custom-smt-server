import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import bakedQuestNpcs from "@/content/wiki/quest-npcs.json"
import bakedQuests from "@/content/wiki/quests.json"
import { resolveWikiRuntimeRoot } from "@/lib/wiki-catalog-load"

export type QuestPhase = {
  phaseNumber: number
  requirementCount: number
  requirements: unknown[]
}

export type QuestRecord = {
  id: number
  title: string
  npc: string | null
  zoneID: number
  coordinates?: { x: number; y: number }
  lines: string[]
  type: string
  phaseCount?: number
  phases: QuestPhase[]
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

type CacheEntry<T> = {
  path: string | null
  mtimeMs: number
  data: T
}

let questsCache: CacheEntry<QuestsPayload> | null = null
let questNpcsCache: CacheEntry<QuestNpcsPayload> | null = null

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
  questsCache = loadCached(
    questsCache,
    filePath,
    bakedQuests as QuestsPayload
  )
  return questsCache.data
}

export function loadQuestNpcsPayload(): QuestNpcsPayload {
  const filePath = path.join(resolveWikiRuntimeRoot(), "wiki", "quest-npcs.json")
  questNpcsCache = loadCached(
    questNpcsCache,
    filePath,
    bakedQuestNpcs as QuestNpcsPayload
  )
  return questNpcsCache.data
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
}

export function knowledgeQuestsDir(): string {
  return path.join(REPO_ROOT, "website", "knowledge", "quests")
}
