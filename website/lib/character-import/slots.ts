import { uuidBytesToString } from "@/lib/armory"
import {
  MAX_CHARACTER_SLOTS,
  NULL_UUID,
} from "@/lib/character-import/types"

function uuidTo16Bytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex")
}

const NULL_BYTES = Buffer.alloc(16)

export function countOccupiedSlots(
  blob: Uint8Array | Buffer | null | undefined
): number {
  if (!blob || blob.length === 0) return 0
  const buf = Buffer.from(blob)
  let n = 0
  for (let i = 0; i < MAX_CHARACTER_SLOTS; i++) {
    const slot = buf.subarray(i * 16, (i + 1) * 16)
    if (slot.length < 16) break
    if (!slot.equals(NULL_BYTES)) n += 1
  }
  return n
}

export function listCharacterUuidsFromBlob(
  blob: Uint8Array | Buffer | null | undefined
): string[] {
  if (!blob || blob.length === 0) return []
  const buf = Buffer.from(blob)
  const out: string[] = []
  for (let i = 0; i < MAX_CHARACTER_SLOTS; i++) {
    const slot = buf.subarray(i * 16, (i + 1) * 16)
    if (slot.length < 16) break
    const id = uuidBytesToString(slot)
    if (id) out.push(id)
  }
  return out
}

/** Append character UUIDs into the first free slots. Throws if not enough room. */
export function appendCharactersBlob(
  existingBlob: Uint8Array | Buffer | null | undefined,
  charUuids: string[]
): Buffer {
  const buf = Buffer.alloc(MAX_CHARACTER_SLOTS * 16)
  if (existingBlob && existingBlob.length > 0) {
    Buffer.from(existingBlob).copy(
      buf,
      0,
      0,
      Math.min(buf.length, existingBlob.length)
    )
  }

  const already = new Set(
    listCharacterUuidsFromBlob(buf).map((u) => u.toLowerCase())
  )

  for (const uuid of charUuids) {
    const key = uuid.toLowerCase()
    if (key === NULL_UUID || already.has(key)) continue
    let placed = false
    for (let i = 0; i < MAX_CHARACTER_SLOTS; i++) {
      const slot = buf.subarray(i * 16, (i + 1) * 16)
      if (slot.equals(NULL_BYTES)) {
        uuidTo16Bytes(uuid).copy(buf, i * 16)
        already.add(key)
        placed = true
        break
      }
    }
    if (!placed) {
      throw new Error("No free character slots on this account")
    }
  }
  return buf
}
