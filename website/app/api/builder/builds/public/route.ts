import { apiFail, apiOk } from "@/lib/api-response"
import {
  listLikedBuildIds,
  listPublishedGearBuilds,
  type PublishedCapFilter,
  type PublishedListSort,
  type PublishedMaxReductions,
  type PublishedMinStats,
} from "@/lib/gear-builds-store"
import {
  isCombatPlannerStatKey,
  summarizePlannerCombat,
  type PlannerStatKey,
} from "@/lib/gear-planner-combat"
import { requireWebSession } from "@/lib/web-session"

const CAPS = new Set<PublishedCapFilter>([
  "lbc",
  "tac",
  "pc",
  "incant",
  "cooldown",
  "pp",
])

/** Short query aliases → PlannerStatKey */
const STAT_ALIASES: Record<string, PlannerStatKey> = {
  critical: "critical",
  crit: "critical",
  fcc: "fcc",
  lbc: "lbc",
  lbp: "lbp",
  lbcap: "lbCap",
  tac: "tac",
  tap: "tap",
  pc: "pc",
  pp: "pp",
  incant: "incant",
  cooldown: "cooldown",
  cd: "cooldown",
}

const MIN_STAT_PARAMS: Array<{ param: string; key: PlannerStatKey }> = [
  { param: "minCritical", key: "critical" },
  { param: "minCrit", key: "critical" },
  { param: "minFcc", key: "fcc" },
  { param: "minLbc", key: "lbc" },
  { param: "minLbp", key: "lbp" },
  { param: "minLbCap", key: "lbCap" },
  { param: "minTac", key: "tac" },
  { param: "minTap", key: "tap" },
  { param: "minPc", key: "pc" },
  { param: "minPp", key: "pp" },
]

function parseStatKey(raw: string): PlannerStatKey | null {
  const key = raw.trim()
  if (!key) return null
  if (isCombatPlannerStatKey(key)) return key
  const aliased = STAT_ALIASES[key.toLowerCase()]
  return aliased ?? null
}

function parseCaps(url: URL): PublishedCapFilter[] {
  const values = [
    ...url.searchParams.getAll("cap"),
    ...(url.searchParams.get("caps")?.split(",") ?? []),
  ]
  const out: PublishedCapFilter[] = []
  for (const raw of values) {
    const key = raw.trim().toLowerCase() as PublishedCapFilter
    if (CAPS.has(key) && !out.includes(key)) out.push(key)
  }
  return out
}

function parsePrioritize(url: URL): PlannerStatKey[] {
  const merged = url.searchParams
    .getAll("prioritize")
    .flatMap((v) => v.split(","))
  const out: PlannerStatKey[] = []
  for (const raw of merged) {
    const key = parseStatKey(raw)
    if (key && !out.includes(key)) out.push(key)
  }
  return out
}

function parseFiniteInt(raw: string | null): number | null {
  if (raw == null || raw === "") return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.floor(n)
}

function parseMinStats(url: URL): {
  minStats: PublishedMinStats
  minLbCap: number | null
} {
  const minStats: PublishedMinStats = {}
  for (const { param, key } of MIN_STAT_PARAMS) {
    const n = parseFiniteInt(url.searchParams.get(param))
    if (n == null) continue
    const prev = minStats[key]
    minStats[key] = prev != null ? Math.max(prev, n) : n
  }
  // min.<stat> style e.g. min.lbc=50
  for (const [name, value] of url.searchParams.entries()) {
    const m = /^min\.(.+)$/i.exec(name)
    if (!m) continue
    const key = parseStatKey(m[1] ?? "")
    if (!key || key === "incant" || key === "cooldown") continue
    const n = parseFiniteInt(value)
    if (n == null) continue
    const prev = minStats[key]
    minStats[key] = prev != null ? Math.max(prev, n) : n
  }
  const minLbCap = minStats.lbCap ?? null
  return { minStats, minLbCap }
}

function parseMaxReductions(url: URL): PublishedMaxReductions {
  const out: PublishedMaxReductions = {}
  // User-facing: max remaining % (display). Stored raw = remaining + 100.
  const maxIncantRemaining = parseFiniteInt(url.searchParams.get("maxIncant"))
  const maxCooldownRemaining = parseFiniteInt(
    url.searchParams.get("maxCooldown") ?? url.searchParams.get("maxCd")
  )
  if (maxIncantRemaining != null) {
    out.incant = maxIncantRemaining + 100
  }
  if (maxCooldownRemaining != null) {
    out.cooldown = maxCooldownRemaining + 100
  }
  return out
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const q = url.searchParams.get("q") ?? undefined
    const genderRaw = url.searchParams.get("gender")?.trim().toLowerCase()
    const gender =
      genderRaw === "male" || genderRaw === "female" ? genderRaw : undefined
    const sortRaw = url.searchParams.get("sort")?.trim().toLowerCase()
    const sort: PublishedListSort =
      sortRaw === "liked" ? "liked" : "newest"
    const caps = parseCaps(url)
    const prioritize = parsePrioritize(url)
    const { minStats, minLbCap } = parseMinStats(url)
    const maxReductions = parseMaxReductions(url)
    const minLikes = parseFiniteInt(url.searchParams.get("minLikes"))
    const minLevel = parseFiniteInt(url.searchParams.get("minLevel"))

    const limitRaw = Number(url.searchParams.get("limit") ?? "50")
    const offsetRaw = Number(url.searchParams.get("offset") ?? "0")
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0

    const { builds, total } = listPublishedGearBuilds({
      limit,
      offset,
      q,
      gender,
      sort,
      caps,
      minLbCap,
      minStats,
      maxReductions,
      prioritize,
      minLikes,
      minLevel,
    })

    const session = await requireWebSession()
    const liked = session
      ? listLikedBuildIds(
          session.username,
          builds.map((b) => b.id)
        )
      : new Set<string>()

    return apiOk({
      total,
      builds: builds.map((b) => {
        const summary =
          b.combatSummary ?? summarizePlannerCombat(b.payload)
        return {
          id: b.id,
          name: b.name,
          username: b.username,
          shareToken: b.shareToken,
          path: `/builder/s/${b.shareToken}`,
          updatedAt: b.updatedAt,
          publishedAt: b.publishedAt,
          likeCount: b.likeCount,
          likedByMe: session ? liked.has(b.id) : false,
          summary,
        }
      }),
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list builds",
      500,
      "GEAR_BUILDS"
    )
  }
}
