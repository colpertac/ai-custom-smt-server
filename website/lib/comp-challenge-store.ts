/**
 * Lobby challenge is one-shot. Concurrent Next.js route handlers all see the
 * *incoming* cookie — Set-Cookie from a sibling request is invisible to them —
 * so an in-process map is the source of truth after the first COMP call.
 * Cookie is still updated for process restarts / cold starts.
 */

const challenges = new Map<string, string>()

function key(username: string): string {
  return username.trim().toLowerCase()
}

export function rememberChallenge(username: string, challenge: string): void {
  const k = key(username)
  if (!k || !challenge) return
  challenges.set(k, challenge)
}

export function resolveChallenge(
  username: string,
  cookieChallenge: string
): string {
  const k = key(username)
  return challenges.get(k) ?? cookieChallenge
}

export function forgetChallenge(username: string): void {
  challenges.delete(key(username))
}
