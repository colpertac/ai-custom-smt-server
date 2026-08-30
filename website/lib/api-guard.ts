import { headers } from "next/headers"

import { assertSameOrigin } from "@/lib/csrf"
import {
  clientIpFromHeaders,
  clientKey,
  rateLimit,
} from "@/lib/rate-limit"
import { apiFail } from "@/lib/api-response"

/** Shared guards for mutating BFF routes (monno-style API, COMP behind it). */
export async function guardApiMutation(
  limitPrefix: string,
  limit: number,
  windowMs: number
) {
  const origin = await assertSameOrigin()
  if (!origin.ok) {
    return apiFail(origin.error, 403, "ORIGIN")
  }

  const h = await headers()
  const limited = rateLimit(
    clientKey(limitPrefix, clientIpFromHeaders(h)),
    limit,
    windowMs
  )
  if (!limited.ok) {
    return apiFail(
      `Too many attempts. Try again in ${limited.retryAfterSec}s.`,
      429,
      "RATE_LIMIT"
    )
  }

  return null
}
