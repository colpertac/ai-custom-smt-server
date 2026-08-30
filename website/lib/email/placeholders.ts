/** COMP stores a unique placeholder when the player omits email (Email is a DB key). */
export function placeholderEmail(username: string): string {
  return `noreply+${username.toLowerCase()}@local.invalid`
}

/** Legacy seed email from upstream COMP_hack — treat as unset in the UI. */
const LEGACY_DEFAULT_EMAIL = "admin@comp_hack.github.com"

export function isPlaceholderEmail(
  email: string | undefined | null,
  username: string
): boolean {
  if (!email) return true
  const normalized = email.toLowerCase()
  if (normalized === LEGACY_DEFAULT_EMAIL) return true
  return normalized === placeholderEmail(username)
}

/** Blank for UI when the account has no real recovery email. */
export function displayEmail(
  email: string | undefined | null,
  username: string
): string {
  if (isPlaceholderEmail(email, username)) return ""
  return (email ?? "").trim()
}
