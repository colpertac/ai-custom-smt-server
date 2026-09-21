import { fetcher } from "@/lib/fetcher"
import type {
  CharacterEditState,
  OwnedCharacterRow,
} from "@/lib/character-expertise-digi-shared"
import type {
  DemonEditState,
  DemonReunionApplyPayload,
} from "@/lib/demon-reunion-edit-shared"

export type AccountCharactersPayload = {
  username: string
  allowExpertiseDigiEdit: boolean
  allowDemonReunionEdit: boolean
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

export type DemonEditAccessPayload = {
  demonId: string
  canEdit: boolean
  owned: boolean
  allowDemonReunionEdit: boolean
  online: boolean
  ownerCharacter: string | null
  state: DemonEditState | null
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

export const fetchDemonEditAccess = (id: string) =>
  fetcher<DemonEditAccessPayload>(
    `account/demons/${encodeURIComponent(id)}/edit`
  )

export const updateDemonReunion = (
  id: string,
  payload: DemonReunionApplyPayload
) =>
  fetcher<{ state: DemonEditState }>(
    `account/demons/${encodeURIComponent(id)}/reunion`,
    { method: "POST", json: payload }
  )
