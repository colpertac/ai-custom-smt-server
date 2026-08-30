import { headers } from "next/headers"

import {
  isValidDemonId,
  loadArmoryDemonDetail,
  WorldDbMissingError,
} from "@/lib/armory-demons"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  clientIpFromHeaders,
  clientKey,
  rateLimit,
} from "@/lib/rate-limit"

type Params = { params: Promise<{ id: string }> }

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

  const id = decodeURIComponent((await params).id ?? "").trim()
  if (!isValidDemonId(id)) {
    return apiFail("Invalid demon id", 400, "VALIDATION")
  }

  try {
    const demon = loadArmoryDemonDetail(id)
    if (!demon) return apiFail("Demon not found", 404, "NOT_FOUND")
    return apiOk(demon)
  } catch (error) {
    if (error instanceof WorldDbMissingError) {
      return apiFail(error.message, 503, "WORLD_DB")
    }
    return apiFail(
      error instanceof Error ? error.message : "Demon lookup failed",
      500,
      "ARMORY"
    )
  }
}
