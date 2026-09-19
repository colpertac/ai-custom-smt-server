/** Shared types/constants safe for client components (no Node FS). */

export const DIGITALIZE_LEVEL_MAX = 10

export const GUARDIAN_RACE_IDS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 51, 52, 53, 54, 55, 56,
  57, 58, 59, 60, 61, 62, 63, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
  111, 112, 113,
]

const RACE_NAMES: Record<number, string> = {
  1: "Seraphim",
  2: "Entity",
  3: "Demon God",
  4: "Vile",
  5: "Avian",
  6: "Goddess",
  7: "Heavenly God",
  8: "Raptor",
  9: "Divine",
  10: "Evil Demon",
  11: "Wild Bird",
  12: "Yoma",
  13: "Earth Element",
  14: "God Spirit",
  15: "Other",
  51: "Reaper",
  52: "Holy Beast",
  53: "Beast",
  54: "Fairy",
  55: "Elemental",
  56: "Majin",
  57: "Mitama",
  58: "Demigod",
  59: "Wilder",
  60: "Dragon King",
  61: "Nocturne",
  62: "Godly Beast",
  63: "Innocent",
  101: "Foul",
  102: "Brute",
  103: "Haunt",
  104: "Dragon",
  105: "Fallen Angel",
  106: "Femme",
  107: "Nation Ruler",
  108: "Earth Mother",
  109: "Evil Dragon",
  110: "Guardian",
  111: "Destroyer",
  112: "Tyrant",
  113: "Gaian",
}

/**
 * Digi race LNC — tribe blocks as used in-game (Law 1–13, Neutral 51–62, Chaos 101–112).
 * Unlisted neighbors (God Spirit/Other, Mitama/Innocent, Gaian) follow the same block.
 */
export type GuardianRaceLnc = "law" | "neutral" | "chaos"

const RACE_LNC: Record<number, GuardianRaceLnc> = {
  // Law
  1: "law", // Seraphim
  2: "law", // Entity
  3: "law", // Demon God
  4: "law", // Vile
  5: "law", // Avian
  6: "law", // Goddess
  7: "law", // Heavenly God
  8: "law", // Raptor
  9: "law", // Divine
  10: "law", // Evil Demon
  11: "law", // Wild Bird
  12: "law", // Yoma
  13: "law", // Earth Element
  14: "law", // God Spirit
  15: "law", // Other
  // Neutral
  51: "neutral", // Reaper
  52: "neutral", // Holy Beast
  53: "neutral", // Beast
  54: "neutral", // Fairy
  55: "neutral", // Elemental
  56: "neutral", // Majin / Fiend
  57: "neutral", // Mitama
  58: "neutral", // Demigod
  59: "neutral", // Wilder
  60: "neutral", // Dragon King
  61: "neutral", // Nocturne
  62: "neutral", // Godly Beast
  63: "neutral", // Innocent
  // Chaos
  101: "chaos", // Foul
  102: "chaos", // Brute
  103: "chaos", // Haunt
  104: "chaos", // Dragon
  105: "chaos", // Fallen Angel
  106: "chaos", // Femme
  107: "chaos", // Nation Ruler
  108: "chaos", // Earth Mother
  109: "chaos", // Evil Dragon
  110: "chaos", // Guardian
  111: "chaos", // Destroyer
  112: "chaos", // Tyrant
  113: "chaos", // Gaian
}

/** Soft card tints — low alpha so they read as a wash, not a paint fill. */
export const GUARDIAN_RACE_LNC_SURFACE_CLASS: Record<GuardianRaceLnc, string> = {
  law: "bg-[rgba(110,168,255,0.10)]",
  neutral: "bg-[rgba(74,222,128,0.09)]",
  chaos: "bg-[rgba(224,112,112,0.10)]",
}

export function getGuardianRaceName(raceId: number): string {
  return RACE_NAMES[raceId] ?? `Race ${raceId}`
}

export function getGuardianRaceLnc(raceId: number): GuardianRaceLnc {
  return RACE_LNC[raceId] ?? "neutral"
}

export function guardianRaceLncSortKey(lnc: GuardianRaceLnc): number {
  if (lnc === "law") return 0
  if (lnc === "neutral") return 1
  return 2
}

export type OwnedCharacterRow = {
  name: string
  level: number
  gender: number
  lastLogin: number
}

export type EditableExpertise = {
  id: number
  name: string
  points: number
  classLevel: number
  rank: number
  maxClass: number
  maxRank: number
  maxPoints: number
  disabled: boolean
}

export type EditableDigitalize = {
  raceId: number
  name: string
  level: number
  points: number
}

export type CharacterEditState = {
  characterName: string
  expertises: EditableExpertise[]
  digitalize: EditableDigitalize[]
}
