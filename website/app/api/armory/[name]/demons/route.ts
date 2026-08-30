import { headers } from "next/headers"

import { isValidCharacterName } from "@/lib/armory"
import {
  loadArmoryDemons,
  WorldDbMissingError,
} from "@/lib/armory-demons"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  clientIpFromHeaders,
  clientKey,
  rateLimit,
} from "@/lib/rate-limit"

type Params = { params: Promise<{ name: string }> }

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

  try {
    const data = loadArmoryDemons(raw)
    if (!data) return apiFail("Character not found", 404, "NOT_FOUND")
    return apiOk(data)
  } catch (error) {
    if (error instanceof WorldDbMissingError) {
      return apiFail(error.message, 503, "WORLD_DB")
    }
    return apiFail(
      error instanceof Error ? error.message : "Armory demons lookup failed",
      500,
      "ARMORY"
    )
  }
}
