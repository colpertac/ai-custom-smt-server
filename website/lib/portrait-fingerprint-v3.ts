import { createHash } from "node:crypto"

import type { AvatarRecipe } from "./avatar-recipe.ts"
import { RENDERER_VERSION, THREE_PORTRAIT_PRESET } from "./portrait-render-mode.ts"

/**
 * v3 portrait fingerprint (three.js render worker, avatar/docs/WORKER.md): a hash of what changes
 * pixels — the resolved avatar recipe, the catalog it came from and the renderer version.
 * Character name is not part of it: the same look shares one PNG.
 */

export type CanonicalAvatarRecipe = {
  gender: AvatarRecipe["gender"]
  skeleton: {
    nif: string
    scale: number
    stance: string | null
    idle: string
  } | null
  /** Folder → file, only parts with a file that exists, sorted by folder. */
  parts: Record<string, string>
  colors: { hair: number[]; eyeRight: number[]; eyeLeft: number[] }
}

/** Recipe reduced to its pixel-relevant fields (`why` / `notes` dropped), fixed key order. */
export function canonicalAvatarRecipe(recipe: AvatarRecipe): CanonicalAvatarRecipe {
  const parts: Record<string, string> = {}
  for (const folder of Object.keys(recipe.parts).sort()) {
    const part = recipe.parts[folder]
    if (part?.file && part.exists) parts[folder] = part.file
  }
  const sk = recipe.skeleton
  return {
    gender: recipe.gender,
    skeleton: sk
      ? { nif: sk.nif, scale: sk.scale, stance: sk.stance, idle: sk.idle }
      : null,
    parts,
    colors: {
      hair: [...recipe.colors.hair],
      eyeRight: [...recipe.colors.eyeRight],
      eyeLeft: [...recipe.colors.eyeLeft],
    },
  }
}

export function portraitFingerprintV3Canonical(
  recipe: AvatarRecipe,
  catalogVersion: number,
  rendererVersion: number = RENDERER_VERSION
): string {
  return [
    "v3",
    `r=${rendererVersion}`,
    `c=${catalogVersion}`,
    `p=${THREE_PORTRAIT_PRESET}`,
    JSON.stringify(canonicalAvatarRecipe(recipe)),
  ].join("|")
}

/** First 16 hex of SHA-256 over the v3 canonical string. */
export function portraitFingerprintV3(
  recipe: AvatarRecipe,
  catalogVersion: number,
  rendererVersion: number = RENDERER_VERSION
): string {
  return createHash("sha256")
    .update(
      portraitFingerprintV3Canonical(recipe, catalogVersion, rendererVersion),
      "utf8"
    )
    .digest("hex")
    .slice(0, 16)
}
