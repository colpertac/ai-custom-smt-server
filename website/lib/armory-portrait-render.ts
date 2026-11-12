/**
 * Mode-aware armory portrait lookup + enqueue (PORTRAIT_RENDERER, avatar/docs/WORKER.md).
 *
 * - wine: v2 fingerprint (name + world-DB look), name-keyed fallback, Wine studio job.
 * - three: v3 fingerprint over the resolved avatar recipe, hash-named PNG only, recipe job.
 */

import {
  appearanceFingerprint,
  resolveArmoryPortrait,
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
  enqueuePortraitJob,
  enqueuePortraitRecipeJob,
  type PortraitJobStatus,
} from "@/lib/portrait-queue"
import {
  getPortraitRendererMode,
  type PortraitRendererMode,
} from "@/lib/portrait-render-mode"
import { isPortraitCaptureAvailable } from "@/lib/studio-api"

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
  mode: PortraitRendererMode
  portrait: ArmoryPortrait
  /** Queue a capture/render for this look; returns the job's fingerprint + status. */
  enqueue: () => { fingerprint: string; status: PortraitJobStatus }
}

/** Fingerprint, cached file and enqueue for one character in the current renderer mode. */
export function planArmoryPortrait(
  input: PortraitFingerprintInput,
  characterName: string
): ArmoryPortraitPlan {
  const mode = getPortraitRendererMode()
  if (mode === "wine") {
    return {
      mode,
      portrait: resolveArmoryPortrait(input, characterName),
      enqueue: () => enqueuePortraitJob(characterName, input),
    }
  }
  const catalog = loadAvatarCatalog().data
  let recipe: AvatarRecipe
  try {
    recipe = resolveAvatarRecipe(avatarCharacterFromPortraitInput(input), catalog)
  } catch (err) {
    // Unresolvable look: show the placeholder; enqueue reports the resolver error.
    const message = err instanceof Error ? err.message : String(err)
    return {
      mode,
      portrait: {
        fingerprint: appearanceFingerprint({ ...input, characterName }),
        url: null,
        status: "missing",
      },
      enqueue: () => {
        throw new Error(`avatar recipe failed for ${characterName}: ${message}`)
      },
    }
  }
  const fingerprint = portraitFingerprintV3(recipe, catalog.version)
  return {
    mode,
    portrait: resolveHashedPortrait(fingerprint),
    enqueue: () => enqueuePortraitRecipeJob(characterName, recipe, catalog.version),
  }
}

/** Mode-aware enqueue for Admin Studio (no availability check). */
export function enqueueArmoryPortrait(
  characterName: string,
  input: PortraitFingerprintInput
): { fingerprint: string; status: PortraitJobStatus } {
  return planArmoryPortrait(input, characterName).enqueue()
}

/**
 * loadArmoryProfile's portrait step: look up the cached PNG and, on a miss, enqueue when a
 * capture is available (Wine studio probes, or a fresh render-worker heartbeat in three mode).
 */
export async function resolveArmoryProfilePortrait(
  input: PortraitFingerprintInput,
  characterName: string,
  opts: { enqueue: boolean; gender: number }
): Promise<{
  portrait: ArmoryPortrait
  status: "ready" | "queued" | "missing"
}> {
  const plan = planArmoryPortrait(input, characterName)
  if (plan.portrait.status === "ready" || !opts.enqueue) {
    return { portrait: plan.portrait, status: plan.portrait.status }
  }
  const canCapture = await isPortraitCaptureAvailable({ gender: opts.gender })
  if (!canCapture) return { portrait: plan.portrait, status: "missing" }
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
