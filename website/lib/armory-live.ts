import type {
  ArmoryActiveDemon,
  ArmoryCombatBonuses,
  ArmoryComputedStats,
  ArmoryProfile,
  ArmoryStats,
} from "@/lib/armory"
import { getDevilName } from "@/lib/armory"

export type LiveArmorySummonedDemon = {
  id?: string
  type: number
  level: number
}

export type LiveArmoryStatsResponse = {
  ok: boolean
  source?: "live"
  online?: boolean
  offline?: boolean
  digitalized?: boolean
  demonSummoned?: boolean
  summonedDemon?: LiveArmorySummonedDemon
  name?: string
  stats?: ArmoryStats
  combatBonuses?: ArmoryCombatBonuses
  error?: string
}

function studioBaseUrl(): string {
  const custom = process.env.PORTRAIT_STUDIO_URL?.trim()
  if (custom) return custom.replace(/\/$/, "")
  return "http://127.0.0.1:14700"
}

function studioToken(): string {
  return (
    process.env.PORTRAIT_STUDIO_TOKEN?.trim() ||
    process.env.COMP_STUDIO_TOKEN?.trim() ||
    ""
  )
}

/** Query channel loopback API for live recalculated stats (character must be online). */
export async function fetchLiveArmoryStats(
  name: string
): Promise<LiveArmoryStatsResponse | null> {
  const token = studioToken()
  if (!token) return null

  const params = new URLSearchParams({ name: name.trim() })
  const url = `${studioBaseUrl()}/armory/stats?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        "X-Studio-Token": token,
        Accept: "application/json",
      },
      cache: "no-store",
    })
  } catch {
    return null
  }

  let json: LiveArmoryStatsResponse
  try {
    json = (await res.json()) as LiveArmoryStatsResponse
  } catch {
    return null
  }

  if (!json.ok) return json
  if (!json.stats) return { ok: false, error: "missing stats payload" }
  return json
}

export function mergeLiveArmoryProfile(
  profile: ArmoryProfile,
  live: LiveArmoryStatsResponse | null,
  fetchedAt: string
): ArmoryProfile {
  if (!live?.ok || !live.stats || !profile.stats) {
    return {
      ...profile,
      statsSource: "estimate",
      statsFetchedAt: fetchedAt,
    }
  }

  const base = profile.stats
  const total = live.stats
  const bonus: Partial<ArmoryStats> = {}
  const keys: (keyof ArmoryStats)[] = [
    "maxHp",
    "maxMp",
    "str",
    "magic",
    "vit",
    "intel",
    "speed",
    "luck",
    "clsr",
    "lngr",
    "spell",
    "support",
    "pdef",
    "mdef",
  ]
  for (const key of keys) {
    const delta = total[key] - base[key]
    if (delta !== 0) bonus[key] = delta
  }

  const computedStats: ArmoryComputedStats = {
    base,
    total,
    bonus,
  }

  const demonSummoned = Boolean(live.demonSummoned)
  let activeDemon: ArmoryActiveDemon | null = profile.activeDemon
  if (demonSummoned && live.summonedDemon) {
    activeDemon = {
      id: live.summonedDemon.id || profile.activeDemon?.id || "",
      type: live.summonedDemon.type,
      name: getDevilName(live.summonedDemon.type),
      level: live.summonedDemon.level,
    }
  }

  return {
    ...profile,
    stats: {
      ...base,
      hp: total.hp,
      mp: total.mp,
      level: total.level,
      xp: total.xp,
    },
    computedStats,
    statsSource: "live",
    statsFetchedAt: fetchedAt,
    statsOnline: true,
    statsDigitalized: Boolean(live.digitalized),
    demonSummoned,
    activeDemon: demonSummoned ? activeDemon : null,
    combatBonuses: live.combatBonuses ?? null,
  }
}
