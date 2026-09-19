/** Shared lobby error → user-facing message for admin character tools. */
export function mapCharacterLobbyError(error: string): string {
  if (error === "character_online") {
    return "Character (or account) is online or in lobby — log them out first (or kick)."
  }
  return error
}
