import { timingSafeEqual } from "node:crypto"

import { apiFail } from "@/lib/api-response"
import { getEffectivePortraitWorkerToken } from "@/lib/studio-settings-store"

/**
 * Shared secret for the portrait render worker (avatar/worker).
 * Header: `X-Portrait-Worker-Token: …`
 *
 * PORTRAIT_WORKER_TOKEN (deploy/install.sh generates it; compose passes it to the website and
 * avatar-worker). See studio-settings-store.ts for the legacy saved-value fallback.
 */
export function portraitWorkerToken(): string {
  return getEffectivePortraitWorkerToken()
}

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Returns null if authorized; otherwise an apiFail Response. */
export function requirePortraitWorker(
  request: Request
): Response | null {
  const expected = portraitWorkerToken()
  if (!expected) {
    return apiFail(
      "Portrait worker token is not set (PORTRAIT_WORKER_TOKEN; deploy/install.sh writes it)",
      503,
      "CONFIG"
    )
  }
  const got =
    request.headers.get("x-portrait-worker-token")?.trim() ||
    request.headers.get("x-studio-token")?.trim() ||
    ""
  if (!got || !tokensEqual(got, expected)) {
    return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  }
  return null
}
