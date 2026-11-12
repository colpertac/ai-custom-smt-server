import fs from "node:fs"
import path from "node:path"

export type EquippedVAEntry = { slot: number; itemType: number }

/**
 * A character's look from the world DB. armory-portrait-render.ts resolves it to an avatar
 * recipe; the v3 fingerprint is taken over that recipe (name, title and demon are not in it).
 */
export type PortraitFingerprintInput = {
  characterName: string
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
  /** CurrentTitle (not part of the render). */
  title: number
  equippedVA: EquippedVAEntry[]
  /** Real EquippedItems slot→type (top/bottom/etc.); many alts never write EquippedVA. */
  equippedItems: EquippedVAEntry[]
  /** Real weapon item Type (slot 13); 0 if empty. VA guns need a matching class. */
  weaponType: number
  /** Kept for API compatibility; portraits are character-only (no summon). */
  demonType: number
}

export type ArmoryPortrait = {
  fingerprint: string
  url: string | null
  status: "ready" | "missing"
}

export function portraitsDir(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  if (custom) {
    return path.join(path.resolve(custom), "armory", "portraits")
  }
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

function publicPortraitUrl(basename: string, ext: ".webp" | ".png"): string {
  return `/armory/portraits/${encodeURIComponent(basename)}${ext}`
}

/** Safe on-disk path for a requested `/armory/portraits/:filename`. */
export function portraitFilePath(filename: string): string | null {
  const base = path.basename(filename)
  if (!base || base !== filename) return null
  if (!/^[0-9A-Za-z._-]{1,64}\.(png|webp)$/i.test(base)) return null
  const dir = path.resolve(portraitsDir())
  const full = path.resolve(dir, base)
  if (full !== dir && !full.startsWith(dir + path.sep)) return null
  return fs.existsSync(full) ? full : null
}

export function portraitContentType(
  filename: string
): "image/png" | "image/webp" {
  return filename.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png"
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

/** `{fingerprint}.png|.webp` (v3 recipe fingerprint, written by the render worker). */
export function resolveHashedPortrait(fingerprint: string): ArmoryPortrait {
  const url = fingerprint ? findPortraitFile(fingerprint) : null
  return url
    ? { fingerprint, url, status: "ready" }
    : { fingerprint, url: null, status: "missing" }
}
