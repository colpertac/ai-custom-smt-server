import { promises as fs } from "node:fs"
import path from "node:path"

import { putFamilyWeightsSchema } from "@/lib/dungeon-payout-schema"
import {
  FAMILY_WEIGHTS_SCHEMA_VERSION,
  type FamilyWeightsFile,
} from "@/lib/dungeon-payout-types"
import { getPayoutsDir } from "@/lib/dungeon-payouts-fs"

export const FAMILY_WEIGHTS_FILENAME = "_family-weights.json"

export function familyWeightsPath(): string {
  return path.join(getPayoutsDir(), FAMILY_WEIGHTS_FILENAME)
}

export function emptyFamilyWeights(): FamilyWeightsFile {
  return { version: FAMILY_WEIGHTS_SCHEMA_VERSION, weights: {} }
}

export async function readFamilyWeights(): Promise<FamilyWeightsFile> {
  try {
    const raw = await fs.readFile(familyWeightsPath(), "utf8")
    const parsed = putFamilyWeightsSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      throw new Error(
        `Invalid family weights file: ${parsed.error.issues[0]?.message}`
      )
    }
    return parsed.data
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return emptyFamilyWeights()
    }
    throw error
  }
}

export async function writeFamilyWeights(
  file: FamilyWeightsFile
): Promise<void> {
  const parsed = putFamilyWeightsSchema.safeParse(file)
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid family weights"
    )
  }
  const dir = getPayoutsDir()
  await fs.mkdir(dir, { recursive: true })
  const body: FamilyWeightsFile = {
    version: FAMILY_WEIGHTS_SCHEMA_VERSION,
    weights: parsed.data.weights,
  }
  await fs.writeFile(
    familyWeightsPath(),
    `${JSON.stringify(body, null, 2)}\n`,
    "utf8"
  )
}
