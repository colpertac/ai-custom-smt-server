import { headers } from "next/headers"

import {
  isArmoryHiddenCharacter,
  isValidCharacterName,
  WorldDbMissingError,
} from "@/lib/armory"
import { loadAvatarRecipe } from "@/lib/avatar-recipe-load"
import { apiFail, apiOk } from "@/lib/api-response"
import { clientIpFromHeaders, clientKey, rateLimit } from "@/lib/rate-limit"

type Params = { params: Promise<{ name: string }> }

/** Reads the live world DB on every request. */
export const dynamic = "force-dynamic"

/** Avatar recipe (skeleton, parts, colours) for the armory 3D renderer. */
export async function GET(_request: Request, { params }: Params) {
  const h = await headers()
  const limited = rateLimit(
    clientKey("armory", clientIpFromHeaders(h)),
    60,
    60_000
  )
  if (!limited.ok) {
    return apiFail(
      `Too many lookups. Try again in ${limited.retryAfterSec}s.`,
      429,
      "RATE_LIMIT"
    )
  }

  const raw = decodeURIComponent((await params).name ?? "").trim()
  if (!isValidCharacterName(raw)) {
    return apiFail("Invalid character name", 400, "VALIDATION")
  }
  if (isArmoryHiddenCharacter(raw)) {
    return apiFail("Character not found", 404, "NOT_FOUND")
  }

  try {
    const recipe = loadAvatarRecipe(raw)
    if (!recipe) {
      return apiFail("Character not found", 404, "NOT_FOUND")
    }
    return apiOk({ name: raw, ...recipe })
  } catch (error) {
    if (error instanceof WorldDbMissingError) {
      return apiFail(error.message, 503, "WORLD_DB")
    }
    return apiFail(
      error instanceof Error ? error.message : "Avatar recipe failed",
      500,
      "ARMORY"
    )
  }
}
