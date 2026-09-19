import { fetcher } from "@/lib/fetcher"
import type { SessionUser } from "@/features/auth/types/session"

export type AdminAccount = SessionUser & {
  username: string
}

export const fetchAdminAccounts = () =>
  fetcher<AdminAccount[]>("admin/accounts")

export const updateAdminAccount = (
  username: string,
  payload: Record<string, unknown>
) =>
  fetcher<{ username: string; selfUpdated?: boolean }>(
    `admin/accounts/${encodeURIComponent(username)}`,
    { method: "POST", json: payload }
  )

export const deleteAdminAccount = (username: string) =>
  fetcher<{ username: string; selfDeleted?: boolean }>(
    `admin/accounts/${encodeURIComponent(username)}`,
    { method: "DELETE" }
  )

export type AdminCharacterSummary = {
  name: string
  level: number
  gender: number
  lastLogin: number
}

export const fetchAdminAccountCharacters = (username: string) =>
  fetcher<{ username: string; characters: AdminCharacterSummary[] }>(
    `admin/accounts/${encodeURIComponent(username)}/characters`
  )

export const renameAdminCharacter = (payload: {
  characterName: string
  newName: string
}) =>
  fetcher<{ name: string; oldName: string }>("admin/characters/rename", {
    method: "POST",
    json: payload,
  })

export const deleteAdminCharacter = (payload: { characterName: string }) =>
  fetcher<{ name: string }>("admin/characters/delete", {
    method: "POST",
    json: payload,
  })

export const transferAdminCharacter = (payload: {
  characterName: string
  toUsername: string
}) =>
  fetcher<{ name: string; toUsername: string }>("admin/characters/transfer", {
    method: "POST",
    json: payload,
  })

export type AdminInventorySlotView = {
  slot: number
  empty: boolean
  uid?: string
  type?: number
  stack_size?: number
  equipped?: boolean
}

export const fetchAdminCharacterInventory = (characterName: string) =>
  fetcher<{ characterName: string; slots: AdminInventorySlotView[] }>(
    `admin/characters/inventory?characterName=${encodeURIComponent(characterName)}`
  )

export const updateAdminCharacterInventory = (payload: {
  characterName: string
  ops: Array<
    | {
        op: "set" | "add"
        slot: number
        itemType: number
        stackSize?: number
      }
    | { op: "set_qty"; slot: number; stackSize: number }
    | { op: "remove"; slot: number }
  >
}) =>
  fetcher<{ characterName: string }>("admin/characters/inventory", {
    method: "POST",
    json: payload,
  })
