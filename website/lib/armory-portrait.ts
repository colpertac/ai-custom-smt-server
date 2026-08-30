import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

/** Bump when the canonical string format changes (invalidates all hashes). */
export const PORTRAIT_FINGERPRINT_VERSION = 1

export type EquippedVAEntry = { slot: number; itemType: number }

export type PortraitFingerprintInput = {
  appearance: {
    gender: number
    skinType: number
    hairType: number
    faceType: number
    eyeType: number
    hairColor: number
    leftEyeColor: number
    rightEyeColor: number
  }
  /** CurrentTitle — shows as floating nameplate in captures. */
  title: number
  equippedVA: EquippedVAEntry[]
  /** Real weapon item Type (slot 13); 0 if empty. VA guns need a matching class. */
  weaponType: number
  /** Active partner devil Type; 0 if none. Captures include the demon. */
  demonType: number
}

export type ArmoryPortrait = {
  fingerprint: string
  url: string | null
  status: "ready" | "missing"
}

export function portraitsDir(): string {
  return path.join(process.cwd(), "public", "armory", "portraits")
}

/**
 * Decode Character.EquippedVA map blob: u32 count, then (u8 slot, u32 itemType)*.
 */
export function decodeEquippedVA(
  blob: Uint8Array | Buffer | null | undefined
): EquippedVAEntry[] {
  if (!blob || blob.length < 4) return []
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const count = buf.readUInt32LE(0)
  const out: EquippedVAEntry[] = []
  let off = 4
  for (let i = 0; i < count; i++) {
    if (off + 5 > buf.length) break
    const slot = buf.readUInt8(off)
    off += 1
    const itemType = buf.readUInt32LE(off)
    off += 4
    if (itemType) out.push({ slot, itemType })
  }
  out.sort((a, b) => a.slot - b.slot || a.itemType - b.itemType)
  return out
}

export function portraitFingerprintCanonical(
  input: PortraitFingerprintInput
): string {
  const va = [...input.equippedVA]
    .filter((e) => e.itemType)
    .sort((a, b) => a.slot - b.slot || a.itemType - b.itemType)
    .map((e) => `${e.slot}:${e.itemType}`)
    .join(",")
  const a = input.appearance
  return [
    `v${PORTRAIT_FINGERPRINT_VERSION}`,
    `g=${a.gender}`,
    `skin=${a.skinType}`,
    `hair=${a.hairType}`,
    `face=${a.faceType}`,
    `eye=${a.eyeType}`,
    `hc=${a.hairColor}`,
    `el=${a.leftEyeColor}`,
    `er=${a.rightEyeColor}`,
    `title=${input.title}`,
    `va=${va}`,
    `w=${input.weaponType}`,
    `d=${input.demonType}`,
  ].join("|")
}

/** 16-hex SHA-256 prefix; filename-safe, enough for this population. */
export function appearanceFingerprint(input: PortraitFingerprintInput): string {
  return createHash("sha256")
    .update(portraitFingerprintCanonical(input), "utf8")
    .digest("hex")
    .slice(0, 16)
}

function publicPortraitUrl(basename: string, ext: ".webp" | ".png"): string {
  return `/armory/portraits/${encodeURIComponent(basename)}${ext}`
}

function findPortraitFile(basename: string): string | null {
  const dir = portraitsDir()
  for (const ext of [".webp", ".png"] as const) {
    if (fs.existsSync(path.join(dir, `${basename}${ext}`))) {
      return publicPortraitUrl(basename, ext)
    }
  }
  return null
}

/**
 * Prefer `{fingerprint}.png|.webp`. Name-keyed files (`cat2.png`) are a PoC
 * fallback until the worker writes hash-named captures.
 */
export function resolveArmoryPortrait(
  input: PortraitFingerprintInput,
  characterName: string
): ArmoryPortrait {
  const fingerprint = appearanceFingerprint(input)
  const hashed = findPortraitFile(fingerprint)
  if (hashed) {
    return { fingerprint, url: hashed, status: "ready" }
  }
  const trimmed = characterName.trim()
  const nameHit =
    findPortraitFile(trimmed) ?? findPortraitFile(trimmed.toLowerCase())
  if (nameHit) {
    return { fingerprint, url: nameHit, status: "ready" }
  }
  return { fingerprint, url: null, status: "missing" }
}
