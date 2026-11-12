import { decodeEquippedItemUids } from "@/lib/armory"
import { decodeEquippedVA } from "@/lib/armory-portrait"
import { loadAvatarCatalog } from "@/lib/avatar-catalog"
import {
  resolveAvatarRecipe,
  type AvatarCharacter,
  type AvatarRecipe,
} from "@/lib/avatar-recipe"
import { getWorldDb } from "@/lib/world-db"

type AvatarCharacterRow = {
  Gender: number
  SkinType: number
  HairType: number
  FaceType: number
  EyeType: number
  HairColor: number
  LeftEyeColor: number
  RightEyeColor: number
  EquippedVA: Uint8Array | Buffer | null
  EquippedItems: Uint8Array | Buffer | null
}

/**
 * Read a character's appearance, VA and equipped item types from the world DB (exact name).
 * Does not apply the armory hidden-name filter; callers that serve the public do.
 */
export function loadAvatarCharacter(name: string): AvatarCharacter | null {
  const db = getWorldDb()
  const row = db
    .prepare(
      `SELECT Gender, SkinType, HairType, FaceType, EyeType, HairColor, LeftEyeColor,
              RightEyeColor, EquippedVA, EquippedItems
       FROM Character WHERE Name = ?`
    )
    .get(name) as AvatarCharacterRow | undefined
  if (!row) return null

  const equip: Record<number, number> = {}
  const uids = decodeEquippedItemUids(row.EquippedItems)
  const present = uids.filter((u): u is string => u != null)
  if (present.length) {
    const types = new Map<string, number>()
    const rows = db
      .prepare(
        `SELECT UID, Type FROM Item WHERE UID IN (${present.map(() => "?").join(",")})`
      )
      .all(...present) as { UID: string; Type: number }[]
    for (const it of rows) types.set(it.UID, it.Type)
    uids.forEach((uid, slot) => {
      const type = uid != null ? types.get(uid) : undefined
      if (type != null) equip[slot] = type
    })
  }

  const va: Record<number, number> = {}
  for (const { slot, itemType } of decodeEquippedVA(row.EquippedVA)) {
    va[slot] = itemType
  }

  return {
    gender: row.Gender,
    skinType: row.SkinType,
    hairType: row.HairType,
    faceType: row.FaceType,
    eyeType: row.EyeType,
    hairColor: row.HairColor,
    leftEyeColor: row.LeftEyeColor,
    rightEyeColor: row.RightEyeColor,
    va,
    equip,
  }
}

/** World-DB character → avatar recipe (resolve.py rules), or null when the character is unknown. */
export function loadAvatarRecipe(name: string): AvatarRecipe | null {
  const character = loadAvatarCharacter(name)
  if (!character) return null
  return resolveAvatarRecipe(character, loadAvatarCatalog().data)
}
