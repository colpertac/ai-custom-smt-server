import { loadConfigDocument } from "@/lib/server-config/fs"
import { isValidCharacterName } from "@/lib/armory"

export type CharacterImportLobbyConfig = {
  registrationUserLevel: number
  characterNameRegex: string | null
}

export async function loadCharacterImportLobbyConfig(): Promise<CharacterImportLobbyConfig> {
  try {
    const { document } = await loadConfigDocument("lobby")
    if (document.kind !== "objgen") {
      return { registrationUserLevel: 0, characterNameRegex: null }
    }
    const levelRaw = document.members["RegistrationUserLevel"]
    const regexRaw = document.members["CharacterNameRegex"]
    const registrationUserLevel =
      typeof levelRaw === "number"
        ? levelRaw
        : typeof levelRaw === "string"
          ? Number(levelRaw) || 0
          : 0
    const characterNameRegex =
      typeof regexRaw === "string" && regexRaw.trim() ? regexRaw.trim() : null
    return { registrationUserLevel, characterNameRegex }
  } catch {
    return { registrationUserLevel: 0, characterNameRegex: null }
  }
}

export function validateImportCharacterName(
  name: string,
  characterNameRegex: string | null
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return "Name is required"
  if (!isValidCharacterName(trimmed)) {
    return "Name must be 1–32 letters, numbers, spaces, _ ' or -"
  }
  if (characterNameRegex) {
    try {
      const re = new RegExp(characterNameRegex)
      if (!re.test(trimmed)) {
        return "Name does not match server CharacterNameRegex"
      }
    } catch {
      // Invalid config regex — fall back to armory allowlist only
    }
  }
  return null
}
