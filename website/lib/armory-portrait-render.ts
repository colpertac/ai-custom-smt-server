/**
 * Armory portrait lookup + enqueue for the three.js render worker (avatar/docs/WORKER.md):
 * v3 fingerprint over the resolved avatar recipe, hash-named PNG, recipe job.
 */

import {
  resolveHashedPortrait,
  type ArmoryPortrait,
  type PortraitFingerprintInput,
} from "@/lib/armory-portrait"
import { loadAvatarCatalog } from "@/lib/avatar-catalog"
import {
  resolveAvatarRecipe,
  type AvatarCharacter,
  type AvatarRecipe,
} from "@/lib/avatar-recipe"
import { portraitFingerprintV3 } from "@/lib/portrait-fingerprint-v3"
import {
  enqueuePortraitRecipeJob,
  isRenderWorkerAvailable,
  type PortraitJobStatus,
} from "@/lib/portrait-queue"

/** Same shape loadAvatarCharacter builds from the world DB, from the armory's portrait input. */
export function avatarCharacterFromPortraitInput(
  input: PortraitFingerprintInput
): AvatarCharacter {
  const va: Record<number, number> = {}
  for (const { slot, itemType } of input.equippedVA) va[slot] = itemType
  const equip: Record<number, number> = {}
  for (const { slot, itemType } of input.equippedItems ?? []) equip[slot] = itemType
  return { ...input.appearance, va, equip }
}

export type ArmoryPortraitPlan = {
  portrait: ArmoryPortrait
  /** Queue a render for this look; returns the job's fingerprint + status. */
  enqueue: () => { fingerprint: string; status: PortraitJobStatus }
}

/** Fingerprint, cached file and enqueue for one character. */
export function planArmoryPortrait(
  input: PortraitFingerprintInput,
  characterName: string
): ArmoryPortraitPlan {
  const catalog = loadAvatarCatalog().data
  let recipe: AvatarRecipe
  try {
    recipe = resolveAvatarRecipe(avatarCharacterFromPortraitInput(input), catalog)
  } catch (err) {
    // Unresolvable look: no fingerprint, show the placeholder; enqueue reports the error.
    const message = err instanceof Error ? err.message : String(err)
    return {
      portrait: { fingerprint: "", url: null, status: "missing" },
      enqueue: () => {
        throw new Error(`avatar recipe failed for ${characterName}: ${message}`)
      },
    }
  }
  const fingerprint = portraitFingerprintV3(recipe, catalog.version)
  return {
    portrait: resolveHashedPortrait(fingerprint),
    enqueue: () => enqueuePortraitRecipeJob(characterName, recipe, catalog.version),
  }
}

/** Enqueue for Admin → Portraits (no availability check). */
export function enqueueArmoryPortrait(
  characterName: string,
  input: PortraitFingerprintInput
): { fingerprint: string; status: PortraitJobStatus } {
  return planArmoryPortrait(input, characterName).enqueue()
}

/** A render worker on this RENDERER_VERSION sent a heartbeat in the last 60 s. */
function isPortraitRenderAvailable(): boolean {
  try {
    return isRenderWorkerAvailable()
  } catch {
    return false
  }
}

/**
 * loadArmoryProfile's portrait step: look up the cached PNG and, on a miss, enqueue when a
 * render worker is online (so an offline worker shows the placeholder, not "Rendering…").
 */
export async function resolveArmoryProfilePortrait(
  input: PortraitFingerprintInput,
  characterName: string,
  opts: { enqueue: boolean }
): Promise<{
  portrait: ArmoryPortrait
  status: "ready" | "queued" | "missing"
}> {
  const plan = planArmoryPortrait(input, characterName)
  if (plan.portrait.status === "ready" || !opts.enqueue) {
    return { portrait: plan.portrait, status: plan.portrait.status }
  }
  if (!isPortraitRenderAvailable()) return { portrait: plan.portrait, status: "missing" }
  try {
    plan.enqueue()
    return { portrait: plan.portrait, status: "queued" }
  } catch (err) {
    console.error(
      `[armory] enqueue portrait failed for ${characterName}:`,
      err instanceof Error ? err.message : err
    )
    return { portrait: plan.portrait, status: "missing" }
  }
}
