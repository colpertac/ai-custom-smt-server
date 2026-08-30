import { headers } from "next/headers"

import { getSiteUrl } from "@/lib/env"

/**
 * Defense in depth for mutating Server Actions.
 * Next.js already checks Origin for Server Actions; this rejects mismatches
 * against SITE_URL (or the request Host) when configured.
 */
export async function assertSameOrigin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const h = await headers()
  const origin = h.get("origin")
  if (!origin) {
    // Non-browser or same-site navigation without Origin — allow.
    return { ok: true }
  }

  const expected = expectedOrigins(h)
  if (expected.some((e) => originsMatch(e, origin))) {
    return { ok: true }
  }

  return { ok: false, error: "Invalid request origin" }
}

function expectedOrigins(h: Headers): string[] {
  const configured = getSiteUrl()
  const out: string[] = []
  if (configured) {
    out.push(configured.replace(/\/$/, ""))
  }

  const host = h.get("x-forwarded-host") || h.get("host")
  const proto =
    h.get("x-forwarded-proto") ||
    (configured?.startsWith("https") ? "https" : "http")
  if (host) {
    out.push(`${proto}://${host}`)
  }

  return out
}

function originsMatch(expected: string, origin: string): boolean {
  try {
    const a = new URL(expected)
    const b = new URL(origin)
    return a.protocol === b.protocol && a.host === b.host
  } catch {
    return expected === origin
  }
}
