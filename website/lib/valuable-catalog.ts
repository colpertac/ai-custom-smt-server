import "server-only"

import type { WikiValuable, WikiValuablesPayload } from "@/content/wiki/types"
import { loadValuablesPayload } from "@/lib/wiki-catalog-load"

let cached: {
  payload: WikiValuablesPayload
  entries: WikiValuable[]
  byId: Map<number, WikiValuable>
} | null = null

function livePayload(): WikiValuablesPayload {
  return loadValuablesPayload().data
}

function ensureCache() {
  const payload = livePayload()
  if (cached?.payload === payload) return cached
  const entries = [...payload.valuables].sort((a, b) => a.id - b.id)
  const byId = new Map(entries.map((v) => [v.id, v]))
  cached = { payload, entries, byId }
  return cached
}

/** CValuablesData from `{runtime}/wiki/valuables.json` when wiki export has run, else bundled. */
export function listValuables(): WikiValuable[] {
  return ensureCache().entries
}

export function getValuable(id: number): WikiValuable | undefined {
  return ensureCache().byId.get(id)
}

export function getValuableName(id: number): string {
  return getValuable(id)?.name ?? `Valuable ${id}`
}
