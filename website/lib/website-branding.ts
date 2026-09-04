/** Client-safe branding helpers (no Node deps). */

export const DEFAULT_SITE_NAME = "Imagine Private"
/** Default mark served from `public/icon.png` (not app/ file metadata). */
export const DEFAULT_SITE_ICON_URL = "/icon.png"

/** Split display name so the last word can use the gold accent. */
export function splitSiteName(siteName: string): {
  lead: string
  accent: string
} {
  const trimmed = siteName.trim() || DEFAULT_SITE_NAME
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) {
    return { lead: "", accent: parts[0] ?? DEFAULT_SITE_NAME }
  }
  return {
    lead: parts.slice(0, -1).join(" "),
    accent: parts[parts.length - 1]!,
  }
}
