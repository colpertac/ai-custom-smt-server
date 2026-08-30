/**
 * Static catalogs for armory display labels.
 * Devil names: extracted from client-source DevilData.xml → content/armory/devils.json
 * Expertise: caps/isChain from ExpertClassData.sbin; names/icons from reimagine-tools.
 * Skill names: Shield SkillData has no display strings — keep numeric IDs for now.
 */
import devilsPayload from "@/content/armory/devils.json"
import expertisesPayload from "@/content/armory/expertises.json"

const devilNames = (devilsPayload as { names: Record<string, string> }).names

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

export function getDevilName(type: number): string {
  return devilNames[String(type)] ?? `Demon ${type}`
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
