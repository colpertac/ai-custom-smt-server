import { fetcher } from "@/lib/fetcher"
import type {
  CharacterEditState,
  OwnedCharacterRow,
} from "@/lib/character-expertise-digi-shared"

export type AccountCharactersPayload = {
  username: string
  allowExpertiseDigiEdit: boolean
  characters: OwnedCharacterRow[]
}

export type CharacterEditAccessPayload = {
  characterName: string
  canEdit: boolean
  owned: boolean
  allowExpertiseDigiEdit: boolean
  online: boolean
  state: CharacterEditState | null
}

export const fetchAccountCharacters = () =>
  fetcher<AccountCharactersPayload>("account/characters")

export const fetchCharacterEditAccess = (name: string) =>
  fetcher<CharacterEditAccessPayload>(
    `account/characters/${encodeURIComponent(name)}/edit`
  )

export const updateCharacterExpertise = (
  name: string,
  updates: Array<{
    expertiseId: number
    classLevel?: number
    rank?: number
    points?: number
  }>
) =>
  fetcher<{ state: CharacterEditState }>(
    `account/characters/${encodeURIComponent(name)}/expertise`,
    { method: "POST", json: { updates } }
  )

export const updateCharacterDigitalize = (
  name: string,
  updates: Array<{ raceId: number; level: number; points?: number }>
) =>
  fetcher<{ state: CharacterEditState }>(
    `account/characters/${encodeURIComponent(name)}/digitalize`,
    { method: "POST", json: { updates } }
  )
