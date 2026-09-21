/**
 * Static catalogs for armory display labels.
 * Devil names/race/LNC: bundled content/armory/devils.json.
 * Live lookup prefers {runtime}/wiki/devils.json via lib/devil-catalog.ts
 * (written by ops wiki export from Shield/DevilData.sbin).
 * Expertise: caps/isChain from ExpertClassData.sbin; names/icons from reimagine-tools.
 * Skill names: Shield SkillData has no display strings — keep numeric IDs for now.
 */
import devilsPayload from "@/content/armory/devils.json"
import expertisesPayload from "@/content/armory/expertises.json"
import { getGuardianRaceName } from "@/lib/character-expertise-digi-shared"

export type DevilResistKind =
  | "normal"
  | "weak"
  | "resist"
  | "null"
  | "repel"
  | "drain"

export type DevilStats = {
  hp: number
  mp: number
  str: number
  magic: number
  vit: number
  int: number
  speed: number
  luck: number
}

export type DevilsPayload = {
  names: Record<string, string>
  races?: Record<string, number | string>
  raceIds?: Record<string, number>
  lncs?: Record<string, number>
  levels?: Record<string, number>
  baseDemonIds?: Record<string, number>
  stats?: Record<string, DevilStats>
  /** Affinity cell text per elem (empty = normal); decimals or nu/rp/dr. */
  resists?: Record<string, Partial<Record<string, string>>>
  resistElems?: string[]
  iconAssets?: Record<string, string>
  iconSrcs?: Record<string, string>
}

const devilCatalog = devilsPayload as DevilsPayload

const EMPTY_STATS: DevilStats = {
  hp: 0,
  mp: 0,
  str: 0,
  magic: 0,
  vit: 0,
  int: 0,
  speed: 0,
  luck: 0,
}

export const DEVIL_RESIST_ELEMS_DEFAULT = [
  "slash",
  "charge",
  "blunt",
  "gun",
  "pierce",
  "spread",
  "fire",
  "ice",
  "elec",
  "force",
  "expel",
  "death",
] as const

/** Icon basename under /wiki/affinity/ (charge → thrust.jpeg). */
export const DEVIL_RESIST_ICON: Record<string, string> = {
  slash: "slash",
  charge: "thrust",
  blunt: "blunt",
  gun: "handgun",
  pierce: "penetrate",
  spread: "spread",
  fire: "fire",
  ice: "ice",
  elec: "electric",
  force: "wind",
  expel: "light",
  death: "dark",
}

export const DEVIL_RESIST_TITLE: Record<string, string> = {
  slash: "Slash",
  charge: "Thrust / Charge",
  blunt: "Blunt / Strike",
  gun: "Gun",
  pierce: "Pierce",
  spread: "Spread",
  fire: "Fire",
  ice: "Ice",
  elec: "Electric",
  force: "Force / Wind",
  expel: "Expel / Light",
  death: "Death / Dark",
}

export function devilResistKind(display: string): DevilResistKind {
  const v = display.trim()
  if (!v || v === "-") return "normal"
  if (v === "nu") return "null"
  if (v === "rp") return "repel"
  if (v === "dr") return "drain"
  if (v === "¼" || v === "½" || v === "¾" || v === "1/4" || v === "1/2" || v === "3/4") {
    return "resist"
  }
  // Legacy letter codes from earlier export
  if (v === "s") return "resist"
  if (v === "w") return "weak"
  if (v === "n") return "null"
  if (v === "r") return "repel"
  if (v === "d") return "drain"
  const num = Number.parseFloat(v)
  if (Number.isFinite(num) && num > 1) return "weak"
  if (Number.isFinite(num) && num > 0 && num < 1) return "resist"
  return "normal"
}

/** Common name prefixes for named variants (filters / chips). */
export const DEVIL_VARIANT_TAGS = [
  "Inexperienced",
  "Deformed",
  "Nightmare",
  "Accomplished",
  "Nimble",
  "Lucky",
  "Heaven-Piercing",
  "Blizzard",
  "Manifestation",
  "Stray",
  "Innocent",
  "Illusionary",
] as const

export function devilVariantTag(
  name: string,
  baseName: string | undefined,
  isStock: boolean
): string | null {
  if (isStock) return null
  if (!baseName) return "Other"
  if (name === baseName) return "Instance"
  if (name.endsWith(baseName)) {
    const prefix = name.slice(0, -baseName.length).trim()
    return prefix || "Instance"
  }
  return "Other"
}

export function entriesFromDevilsPayload(
  payload: DevilsPayload
): DevilCatalogEntry[] {
  const raceIds = payload.raceIds ?? {}
  const lncs = payload.lncs ?? {}
  const levels = payload.levels ?? {}
  const baseDemonIds = payload.baseDemonIds ?? {}
  const stats = payload.stats ?? {}
  const resists = payload.resists ?? {}
  const iconSrcs = payload.iconSrcs ?? {}
  const iconAssets = payload.iconAssets ?? {}
  const names = payload.names ?? {}
  const resistElems = payload.resistElems?.length
    ? payload.resistElems
    : [...DEVIL_RESIST_ELEMS_DEFAULT]
  return Object.entries(names)
    .map(([idStr, name]) => {
      const id = Number(idStr)
      const raceId = raceIds[idStr] ?? 0
      const lnc = lncs[idStr] ?? 0
      const rawRes = resists[idStr] ?? {}
      const resistMap: Record<string, string> = {}
      for (const elem of resistElems) {
        const raw = rawRes[elem] ?? ""
        // Migrate older export formats
        if (raw === "-") resistMap[elem] = ""
        else if (raw === "n") resistMap[elem] = "nu"
        else if (raw === "r") resistMap[elem] = "rp"
        else if (raw === "d") resistMap[elem] = "dr"
        else if (raw === "w") resistMap[elem] = "2"
        else if (raw === "s") resistMap[elem] = "0.5"
        else if (raw === "¼") resistMap[elem] = "0.25"
        else if (raw === "½") resistMap[elem] = "0.5"
        else if (raw === "¾") resistMap[elem] = "0.75"
        else if (raw === "2.0") resistMap[elem] = "2"
        else if (raw === "1.5") resistMap[elem] = "1.5"
        else if (raw === "1.25") resistMap[elem] = "1.25"
        else resistMap[elem] = raw
      }
      const asset = iconAssets[idStr]
      const iconSrc = iconSrcs[idStr] ?? null
      const baseDemonId = Number(baseDemonIds[idStr] ?? id)
      const isStock = !Number.isFinite(baseDemonId) || baseDemonId === id
      const baseName = names[String(baseDemonId)]
      return {
        id,
        name,
        raceId,
        race: getGuardianRaceName(raceId),
        lnc,
        alignment: devilAlignmentFromLnc(lnc),
        level: levels[idStr] ?? 0,
        stats: stats[idStr] ?? EMPTY_STATS,
        resists: resistMap,
        resistElems,
        iconSrc,
        iconAsset: asset ?? null,
        baseDemonId: Number.isFinite(baseDemonId) ? baseDemonId : id,
        isStock,
        variantTag: devilVariantTag(name, baseName, isStock),
      }
    })
    .filter((e) => Number.isFinite(e.id))
    .sort((a, b) => a.id - b.id)
}

type ExpertiseMeta = {
  name?: string
  maxClass: number
  maxRank: number
  isChain?: boolean
  implemented?: boolean
  /** Basename without .png under /armory/expertise/ (e.g. attack-01). */
  icon?: string
  slug?: string
  /**
   * Derived chain formula from ExpertClassData:
   * [sourceExpertiseId, rankRequired (points/10000), chainPercent]
   */
  chain?: number[][]
}

const expertiseCatalog = (
  expertisesPayload as { expertises: Record<string, ExpertiseMeta> }
).expertises

/** Stored points per class / rank (CharacterManager / CharacterState). */
export const EXPERTISE_POINTS_PER_RANK = 10_000
export const EXPERTISE_POINTS_PER_CLASS = 100_000

export type ExpertiseProgress = {
  /** Class index (points / 100000). */
  classLevel: number
  /** Rank within class 0–9 ((points % 100000) / 10000). */
  rank: number
  /** Client-style display points (stored / 100). */
  displayPoints: number
  maxClass: number
  maxRank: number
  /** Absolute max stored points for this expertise. */
  maxPoints: number
  /** 0–1 fill within the current class (or final partial class). */
  classProgress: number
  /** 0–1 fill toward expertise max. */
  overallProgress: number
  atMax: boolean
}

/** Same thresholds as ActiveEntityState::CalculateLNCType. */
export type DevilAlignment = "law" | "neutral" | "chaos"

export function devilAlignmentFromLnc(lnc: number): DevilAlignment {
  if (lnc <= -5000) return "law"
  if (lnc >= 5000) return "chaos"
  return "neutral"
}

export type DevilCatalogEntry = {
  id: number
  name: string
  raceId: number
  race: string
  lnc: number
  alignment: DevilAlignment
  level: number
  stats: DevilStats
  /** Affinity cell text; empty string = normal. */
  resists: Record<string, string>
  resistElems: string[]
  iconSrc: string | null
  iconAsset: string | null
  /** Stock form ID this row belongs to (self when stock). */
  baseDemonId: number
  /** True when this row is the canonical stock demon. */
  isStock: boolean
  /** Name prefix tag (Nightmare, Deformed, …), Instance, Other, or null if stock. */
  variantTag: string | null
}

let devilListCache: DevilCatalogEntry[] | null = null

/** Bundled DevilData snapshot. Live wiki pages use `listDevils` from devil-catalog. */
export function listBundledDevils(): DevilCatalogEntry[] {
  if (!devilListCache) {
    devilListCache = entriesFromDevilsPayload(devilCatalog)
  }
  return devilListCache
}

export function hasBundledDevilType(type: number): boolean {
  return Object.prototype.hasOwnProperty.call(devilCatalog.names, String(type))
}

export function getBundledDevilName(type: number): string {
  return devilCatalog.names[String(type)] ?? `Demon ${type}`
}

export function getExpertiseMeta(id: number): ExpertiseMeta {
  return (
    expertiseCatalog[String(id)] ?? {
      maxClass: 10,
      maxRank: 0,
      isChain: id >= 39,
      implemented: true,
    }
  )
}

export function getExpertiseName(id: number): string {
  return getExpertiseMeta(id).name ?? `Expertise ${id}`
}

export function getExpertiseIconSrc(id: number): string | null {
  const icon = getExpertiseMeta(id).icon
  return icon ? `/armory/expertise/${icon}.png` : null
}

/** All chain expertise IDs that have an ExpertClassData formula. */
export function listChainExpertiseIds(): number[] {
  return Object.entries(expertiseCatalog)
    .filter(([, meta]) => meta.isChain && meta.chain && meta.chain.length > 0)
    .map(([id]) => Number(id))
    .sort((a, b) => a - b)
}

/**
 * Mirror CharacterState::GetExpertisePoints for isChain expertises:
 * if every source meets rankRequired, sum sourcePoints * percent; else 0.
 * `basePointsById` is raw DB points for non-chain rows only.
 */
export function computeChainExpertisePoints(
  chainId: number,
  basePointsById: ReadonlyMap<number, number> | Record<number, number>
): number {
  const meta = getExpertiseMeta(chainId)
  if (!meta.isChain || !meta.chain?.length) return 0

  const get = (id: number): number => {
    if (basePointsById instanceof Map) return basePointsById.get(id) ?? 0
    return (basePointsById as Record<number, number>)[id] ?? 0
  }

  let sum = 0
  for (const link of meta.chain) {
    const sourceId = link[0] ?? 0
    const rankRequired = link[1] ?? 0
    const percent = link[2] ?? 0
    const pts = get(sourceId)
    const rank = Math.floor(Math.max(0, pts) / EXPERTISE_POINTS_PER_RANK)
    if (rank < rankRequired) return 0
    if (percent > 0) {
      sum += Math.trunc(pts * percent)
    }
  }
  return sum
}

export function expertiseMaxPoints(maxClass: number, maxRank: number): number {
  return (
    maxClass * EXPERTISE_POINTS_PER_CLASS +
    maxRank * EXPERTISE_POINTS_PER_RANK
  )
}

/**
 * Parse stored expertise points into class / rank / progress.
 * Server: class = points/100000, rank = (points%100000)/10000.
 * Player shorthand (display): every 100 → +1 rank, every 1000 → +1 class.
 */
export function parseExpertiseProgress(
  points: number,
  maxClass: number,
  maxRank: number
): ExpertiseProgress {
  const maxPoints = expertiseMaxPoints(maxClass, maxRank)
  const raw = Math.max(0, Math.floor(points))
  const clamped = maxPoints > 0 ? Math.min(raw, maxPoints) : raw
  const classLevel = Math.floor(clamped / EXPERTISE_POINTS_PER_CLASS)
  const rank = Math.floor(
    (clamped % EXPERTISE_POINTS_PER_CLASS) / EXPERTISE_POINTS_PER_RANK
  )
  const atMax = maxPoints > 0 && clamped >= maxPoints

  let classProgress = 0
  if (atMax) {
    classProgress = 1
  } else if (maxPoints > 0 && classLevel >= maxClass) {
    const start = maxClass * EXPERTISE_POINTS_PER_CLASS
    const span = Math.max(1, maxPoints - start)
    classProgress = (clamped - start) / span
  } else if (maxPoints <= 0) {
    classProgress = 0
  } else {
    classProgress =
      (clamped % EXPERTISE_POINTS_PER_CLASS) / EXPERTISE_POINTS_PER_CLASS
  }

  const overallProgress =
    maxPoints > 0 ? Math.min(1, clamped / maxPoints) : 0

  return {
    classLevel,
    rank,
    displayPoints: Math.floor(clamped / 100),
    maxClass,
    maxRank,
    maxPoints,
    classProgress: Math.min(1, Math.max(0, classProgress)),
    overallProgress: Math.min(1, Math.max(0, overallProgress)),
    atMax,
  }
}

/** @deprecated Use parseExpertiseProgress — this is total rank (class*10+rank). */
export function expertiseRank(points: number): number {
  return Math.floor(Math.max(0, points) / EXPERTISE_POINTS_PER_RANK)
}

export function formatSkillId(id: number): string {
  return `#${id}`
}
