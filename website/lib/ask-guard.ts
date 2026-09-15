/** Max player question length for Ask / Help. */
export const ASK_MAX_QUERY_LENGTH = 400

const REFUSE_PATTERNS: RegExp[] = [
  /\bpassword\b/i,
  /\baccount\s*(hack|steal|crack|dump|breach)\b/i,
  /\b(hack|exploit|cheat|bot)\b.*\b(account|server|game|client)\b/i,
  /\b(sql\s*inject(?:ion)?|sqli|rce|remote\s*code|shell\s*access)\b/i,
  /\bbypass\s*(auth|login|ban|security)\b/i,
  /\bsteal\s*(cp|macca|items|account)\b/i,
  /\bddos\b/i,
  /\bgm\s*panel\b/i,
  /\badmin\s*password\b/i,
]

export function isRefusedAskQuery(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  return REFUSE_PATTERNS.some((rx) => rx.test(q))
}

export const ASK_REFUSAL_MESSAGE =
  "I can only help with in-game quests and catalog data from this server. " +
  "I can't help with accounts, passwords, exploits, or cheating."
