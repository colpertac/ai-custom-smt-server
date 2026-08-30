import { timingSafeEqual } from "node:crypto"

import { apiFail } from "@/lib/api-response"

/**
 * Shared secret for the remote portrait worker (homelab).
 * Header: `X-Portrait-Worker-Token: …`
 *
 * Prefer `PORTRAIT_WORKER_TOKEN`. Falls back to `PORTRAIT_STUDIO_TOKEN` so
 * local/dev can reuse one secret.
 */
export function portraitWorkerToken(): string {
  return (
    process.env.PORTRAIT_WORKER_TOKEN?.trim() ||
    process.env.PORTRAIT_STUDIO_TOKEN?.trim() ||
    process.env.COMP_STUDIO_TOKEN?.trim() ||
    ""
  )
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
      "PORTRAIT_WORKER_TOKEN (or PORTRAIT_STUDIO_TOKEN) is not set on the website",
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
