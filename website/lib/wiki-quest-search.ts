/** Pure helpers for wiki quest search (safe for client components). */

export type WikiQuestSearchHit = {
  id: number
  title: string
  type: string
  npc: string | null
  zoneLabel: string
}

function scoreQuestHit(query: string, hit: WikiQuestSearchHit): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const idStr = String(hit.id)
  if (idStr === q) return 1000
  if (idStr.startsWith(q)) return 800
  const title = (hit.title ?? "").toLowerCase()
  if (title && title === q) return 900
  if (title && title.includes(q)) return 600 + Math.min(q.length, 40)
  if (hit.npc?.toLowerCase().includes(q)) return 200
  if (hit.zoneLabel?.toLowerCase().includes(q)) return 100
  return 0
}

export function filterWikiQuestHits(
  index: WikiQuestSearchHit[],
  query: string,
  limit = 8
): WikiQuestSearchHit[] {
  const q = query.trim()
  if (!q) return []
  return index
    .map((hit) => ({ hit, score: scoreQuestHit(q, hit) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.hit.id - b.hit.id)
    .slice(0, limit)
    .map((row) => row.hit)
}
