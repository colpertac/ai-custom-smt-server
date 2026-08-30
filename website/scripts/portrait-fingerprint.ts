/**
 * Compute fingerprint for a character and optionally ingest a PNG.
 *
 *   npm run portrait-queue -- (not this)
 *   node --experimental-strip-types scripts/portrait-fingerprint.ts catm
 *   node --experimental-strip-types scripts/portrait-fingerprint.ts catm /path/to.png
 */
import {
  appearanceFingerprint,
  decodeEquippedVA,
  portraitFingerprintCanonical,
  type PortraitFingerprintInput,
} from "../lib/armory-portrait.ts"
import { enqueuePortraitJob, ingestPortraitFile } from "../lib/portrait-queue.ts"
import { getWorldDb } from "../lib/world-db.ts"

const NULL_UUID = "00000000-0000-0000-0000-000000000000"

function uuidBytesToString(bytes: Uint8Array): string | null {
  const hex = Buffer.from(bytes).toString("hex")
  if (hex === "0".repeat(32)) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function decodeEquippedItemUids(
  blob: Uint8Array | Buffer | null | undefined
): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: 15 }, () => null)
  if (!blob || blob.length < 240) return out
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  for (let i = 0; i < 15; i++) {
    out[i] = uuidBytesToString(buf.subarray(i * 16, i * 16 + 16))
  }
  return out
}

const name = process.argv[2]
const png = process.argv[3]
if (!name) {
  console.error("usage: portrait-fingerprint <name> [png]")
  process.exit(1)
}

const db = getWorldDb()
const row = db
  .prepare(
    `SELECT Name, Gender, SkinType, HairType, FaceType, EyeType,
            HairColor, LeftEyeColor, RightEyeColor, CurrentTitle,
            EquippedItems, EquippedVA
     FROM Character WHERE Name = ? COLLATE NOCASE`
  )
  .get(name) as
  | {
      Name: string
      Gender: number
      SkinType: number
      HairType: number
      FaceType: number
      EyeType: number
      HairColor: number
      LeftEyeColor: number
      RightEyeColor: number
      CurrentTitle: number
      EquippedItems: Buffer | null
      EquippedVA: Buffer | null
    }
  | undefined

if (!row) {
  console.error(`character not found: ${name}`)
  process.exit(1)
}

const weaponUid = decodeEquippedItemUids(row.EquippedItems)[13]
let weaponType = 0
if (weaponUid && weaponUid !== NULL_UUID) {
  const it = db
    .prepare(`SELECT Type FROM Item WHERE UID = ?`)
    .get(weaponUid) as { Type: number } | undefined
  weaponType = it?.Type ?? 0
}

const input: PortraitFingerprintInput = {
  appearance: {
    gender: row.Gender,
    skinType: row.SkinType,
    hairType: row.HairType,
    faceType: row.FaceType,
    eyeType: row.EyeType,
    hairColor: row.HairColor,
    leftEyeColor: row.LeftEyeColor,
    rightEyeColor: row.RightEyeColor,
  },
  title: row.CurrentTitle,
  equippedVA: decodeEquippedVA(row.EquippedVA),
  weaponType,
  demonType: 0,
}

const fingerprint = appearanceFingerprint(input)
console.log(`character    ${row.Name}`)
console.log(`canonical    ${portraitFingerprintCanonical(input)}`)
console.log(`fingerprint  ${fingerprint}`)
console.log(`weaponType   ${weaponType}`)
console.log(`va count     ${input.equippedVA.length}`)

const enq = enqueuePortraitJob(row.Name, input)
console.log(`queue        ${enq.status}`)

if (png) {
  const result = ingestPortraitFile(png, fingerprint)
  console.log(`ingested     ${result.fingerprint}`)
  console.log(`url          ${result.url}`)
}
