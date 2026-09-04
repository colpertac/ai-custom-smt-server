import { NextResponse } from "next/server"

import { readWebsiteBrandingIcon } from "@/lib/site-settings-store"

export const dynamic = "force-dynamic"

export async function GET() {
  const icon = readWebsiteBrandingIcon()
  if (!icon) {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(new Uint8Array(icon.bytes), {
    status: 200,
    headers: {
      "Content-Type": icon.contentType,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ...(icon.updatedAt
        ? { ETag: `"${icon.updatedAt}"` }
        : {}),
    },
  })
}
