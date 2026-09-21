/** Client-safe constants and types for demon reunion / mitama editing. */

export const REUNION_BRANCH_COUNT = 12
export const MITAMA_SLOTS_PER_BRANCH = 8
export const MITAMA_REUNION_SLOT_COUNT =
  REUNION_BRANCH_COUNT * MITAMA_SLOTS_PER_BRANCH

export const REUNION_RANK_MAX = 8
export const MITAMA_BONUS_ID_MAX = 127
export const MITAMA_RANK_MAX = 15

/** GroupID 1–12 → index 0–11 (runestone / growth branches). */
export const REUNION_BRANCH_NAMES = [
  "Tiwaz",
  "Peorth",
  "Fehu",
  "Eihwaz",
  "Uruz",
  "Hagalaz",
  "Laguz",
  "Ansuz",
  "Nauthiz",
  "Ingwaz",
  "Sowilo",
  "Wyrd",
] as const

export type ReunionBranchName = (typeof REUNION_BRANCH_NAMES)[number]

export function getReunionBranchName(index: number): string {
  return REUNION_BRANCH_NAMES[index] ?? `Branch ${index + 1}`
}

/** Mitama spirit types stored on Demon.MitamaType (0 = none). */
export const MITAMA_TYPE_OPTIONS = [
  { id: 0, name: "None" },
  { id: 1, name: "Aramitama" },
  { id: 2, name: "Nigimitama" },
  { id: 3, name: "Kushimitama" },
  { id: 4, name: "Sakimitama" },
] as const

export function getMitamaTypeName(type: number): string {
  return MITAMA_TYPE_OPTIONS.find((o) => o.id === type)?.name ?? `Type ${type}`
}

/**
 * Mitama rebirth bar colors (what the client shows as red/blue/green/yellow).
 * Slot value 0 = empty; otherwise spirit = floor(bonusId / 32) + 1.
 * Many IDs exist per color — each ID is a different random bonus effect.
 */
export const MITAMA_SPIRIT_OPTIONS = [
  { id: 0, name: "Empty", short: "—", color: "transparent", colorLabel: "" },
  {
    id: 1,
    name: "Aramitama",
    short: "Ara",
    color: "#e85d5d",
    colorLabel: "Red",
  },
  {
    id: 2,
    name: "Nigimitama",
    short: "Nigi",
    color: "#5b8def",
    colorLabel: "Blue",
  },
  {
    id: 3,
    name: "Kushimitama",
    short: "Kusi",
    color: "#5ecf7a",
    colorLabel: "Green",
  },
  {
    id: 4,
    name: "Sakimitama",
    short: "Saki",
    color: "#e8c84a",
    colorLabel: "Yellow",
  },
] as const

export type MitamaSpiritId = 0 | 1 | 2 | 3 | 4

/**
 * Bonus ID band for a mitama spirit type (1–4): `(type-1)*32 … +31`.
 * Used when auto-filling empty mitama reunion slots.
 */
export function mitamaBonusIdBand(
  mitamaType: number
): { start: number; end: number } | null {
  const t = Math.floor(mitamaType)
  if (t < 1 || t > 4) return null
  const start = (t - 1) * 32
  return { start, end: start + 31 }
}

/** Spirit/color for a stored MitamaReunion bonus ID (0 = empty). */
export function mitamaSpiritFromBonusId(bonusId: number): MitamaSpiritId {
  const id = Math.floor(Number(bonusId) || 0)
  if (id <= 0) return 0
  const spirit = Math.floor(id / 32) + 1
  if (spirit < 1 || spirit > 4) return 0
  return spirit as MitamaSpiritId
}

/**
 * Pick a bonus ID for a spirit. Keeps `currentId` when it already matches
 * that color so specific effects are not wiped by color-only edits.
 */
export function bonusIdForMitamaSpirit(
  spirit: number,
  currentId = 0
): number {
  const s = Math.floor(spirit)
  if (s <= 0 || s > 4) return 0
  if (mitamaSpiritFromBonusId(currentId) === s) return currentId
  const band = mitamaBonusIdBand(s)
  if (!band) return 0
  // Prefer +1 in-band (ID 0 / multiples of 32 are unused in live data).
  return Math.min(band.end, band.start + 1)
}

export function getMitamaSpiritOption(spirit: number) {
  return (
    MITAMA_SPIRIT_OPTIONS.find((o) => o.id === spirit) ?? MITAMA_SPIRIT_OPTIONS[0]
  )
}

/**
 * In-game rule: a branch may only hold as many Mitama slots as its reunion
 * rank (capped at 8). Clears bonus IDs in slots beyond each branch's rank.
 */
export function clampMitamaSlotsToReunionRanks(
  mitamaReunion: number[],
  reunion: number[]
): number[] {
  const next = Array.from({ length: MITAMA_REUNION_SLOT_COUNT }, (_, i) =>
    Math.max(0, Math.floor(Number(mitamaReunion[i]) || 0))
  )
  for (let branch = 0; branch < REUNION_BRANCH_COUNT; branch++) {
    const available = Math.max(
      0,
      Math.min(MITAMA_SLOTS_PER_BRANCH, Math.floor(Number(reunion[branch]) || 0))
    )
    const start = branch * MITAMA_SLOTS_PER_BRANCH
    for (let i = available; i < MITAMA_SLOTS_PER_BRANCH; i++) {
      next[start + i] = 0
    }
  }
  return next
}

/** How many Mitama slots a branch rank unlocks (0–8). */
export function mitamaSlotsAvailableForRank(rank: number): number {
  return Math.max(
    0,
    Math.min(MITAMA_SLOTS_PER_BRANCH, Math.floor(Number(rank) || 0))
  )
}

export type DemonEditState = {
  demonId: string
  name: string
  type: number
  /** Owning character name when in COMP; null for account storage. */
  ownerCharacter: string | null
  location: "comp" | "account_storage" | "unknown"
  reunion: number[]
  mitamaReunion: number[]
  mitamaRank: number
  mitamaType: number
  /** G-Type — DevilLVUpRateData ID (active reunion growth path). */
  growthType: number
}

export type DemonReunionApplyPayload = {
  reunion: number[]
  mitamaReunion: number[]
  mitamaRank: number
  mitamaType: number
  growthType: number
}
