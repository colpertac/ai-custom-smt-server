import "server-only"

import type { WikiSkill, WikiSkillsPayload } from "@/content/wiki/types"
import { loadSkillsPayload } from "@/lib/wiki-catalog-load"

let cached: {
  payload: WikiSkillsPayload
  entries: WikiSkill[]
  byId: Map<number, WikiSkill>
} | null = null

function livePayload(): WikiSkillsPayload {
  return loadSkillsPayload().data
}

function ensureCache() {
  const payload = livePayload()
  if (cached?.payload === payload) return cached
  const entries = [...payload.skills].sort((a, b) => a.id - b.id)
  const byId = new Map(entries.map((s) => [s.id, s]))
  cached = { payload, entries, byId }
  return cached
}

/** CSkillData from `{runtime}/wiki/skills.json` when wiki export has run, else bundled. */
export function listSkills(): WikiSkill[] {
  return ensureCache().entries
}

export function getSkill(id: number): WikiSkill | undefined {
  return ensureCache().byId.get(id)
}

export function getSkillName(id: number): string {
  return getSkill(id)?.name ?? `Skill ${id}`
}
