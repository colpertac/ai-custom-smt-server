import { NextResponse } from "next/server"

import { isWikiAvailable } from "@/lib/wiki-availability"

export async function GET() {
  const enabled = isWikiAvailable()
  return NextResponse.json({
    enabled,
    message: enabled
      ? "Wiki catalog available"
      : "Upload BinaryData (game client files) before the item wiki is enabled",
  })
}
