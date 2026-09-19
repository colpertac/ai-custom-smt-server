import {
  getSiteSetting,
  setSiteSetting,
} from "@/lib/site-settings-store"

export type ExpertiseDigiEditSettings = {
  /** Master switch — when false, nobody gets the armory editor. */
  enabled: boolean
  /** Accounts with userLevel >= this may edit (when enabled). */
  minUserLevel: number
}

const KEY_ENABLED = "expertise_digi_edit_enabled"
const KEY_MIN_LEVEL = "expertise_digi_edit_min_user_level"

export const DEFAULT_EXPERTISE_DIGI_EDIT: ExpertiseDigiEditSettings = {
  enabled: false,
  minUserLevel: 0,
}

function parseMinLevel(raw: string | null): number {
  if (raw == null || raw.trim() === "") return DEFAULT_EXPERTISE_DIGI_EDIT.minUserLevel
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return DEFAULT_EXPERTISE_DIGI_EDIT.minUserLevel
  return Math.max(0, Math.min(1000, n))
}

export function getExpertiseDigiEditSettings(): ExpertiseDigiEditSettings {
  return {
    enabled: getSiteSetting(KEY_ENABLED) === "1",
    minUserLevel: parseMinLevel(getSiteSetting(KEY_MIN_LEVEL)),
  }
}

export function setExpertiseDigiEditSettings(
  patch: Partial<ExpertiseDigiEditSettings>
): ExpertiseDigiEditSettings {
  const current = getExpertiseDigiEditSettings()
  const next: ExpertiseDigiEditSettings = {
    enabled: patch.enabled ?? current.enabled,
    minUserLevel:
      patch.minUserLevel !== undefined
        ? Math.max(0, Math.min(1000, Math.floor(patch.minUserLevel)))
        : current.minUserLevel,
  }
  setSiteSetting(KEY_ENABLED, next.enabled ? "1" : "0")
  setSiteSetting(KEY_MIN_LEVEL, String(next.minUserLevel))
  return next
}

/** True when global toggle is on and this account's GM/user level meets the bar. */
export function canEditExpertiseDigi(userLevel: number | null | undefined): boolean {
  const settings = getExpertiseDigiEditSettings()
  if (!settings.enabled) return false
  const level = Math.floor(Number(userLevel) || 0)
  return level >= settings.minUserLevel
}
