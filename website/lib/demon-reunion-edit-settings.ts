import {
  getSiteSetting,
  setSiteSetting,
} from "@/lib/site-settings-store"

export type DemonReunionEditSettings = {
  /** Master switch — when false, nobody gets the demon reunion editor. */
  enabled: boolean
  /** Accounts with userLevel >= this may edit (when enabled). */
  minUserLevel: number
}

const KEY_ENABLED = "demon_reunion_edit_enabled"
const KEY_MIN_LEVEL = "demon_reunion_edit_min_user_level"

export const DEFAULT_DEMON_REUNION_EDIT: DemonReunionEditSettings = {
  enabled: false,
  minUserLevel: 0,
}

function parseMinLevel(raw: string | null): number {
  if (raw == null || raw.trim() === "") {
    return DEFAULT_DEMON_REUNION_EDIT.minUserLevel
  }
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return DEFAULT_DEMON_REUNION_EDIT.minUserLevel
  return Math.max(0, Math.min(1000, n))
}

export function getDemonReunionEditSettings(): DemonReunionEditSettings {
  return {
    enabled: getSiteSetting(KEY_ENABLED) === "1",
    minUserLevel: parseMinLevel(getSiteSetting(KEY_MIN_LEVEL)),
  }
}

export function setDemonReunionEditSettings(
  patch: Partial<DemonReunionEditSettings>
): DemonReunionEditSettings {
  const current = getDemonReunionEditSettings()
  const next: DemonReunionEditSettings = {
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
export function canEditDemonReunion(
  userLevel: number | null | undefined
): boolean {
  const settings = getDemonReunionEditSettings()
  if (!settings.enabled) return false
  const level = Math.floor(Number(userLevel) || 0)
  return level >= settings.minUserLevel
}
