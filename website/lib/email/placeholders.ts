/** COMP stores a unique placeholder when the player omits email (Email is a DB key). */
export function placeholderEmail(username: string): string {
  return `noreply+${username.toLowerCase()}@local.invalid`
}

export function isPlaceholderEmail(
  email: string | undefined | null,
  username: string
): boolean {
  if (!email) return true
  return email.toLowerCase() === placeholderEmail(username)
}

/** Blank for UI when the account has no real recovery email. */
export function displayEmail(
  email: string | undefined | null,
  username: string
): string {
  if (isPlaceholderEmail(email, username)) return ""
  return (email ?? "").trim()
}
