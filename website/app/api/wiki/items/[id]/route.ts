import { NextResponse } from "next/server"

import { getWikiItem } from "@/lib/wiki-catalog"
import { isWikiAvailable } from "@/lib/wiki-availability"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  if (!isWikiAvailable()) {
    return NextResponse.json(
      {
        error: "Wiki unavailable until BinaryData is uploaded",
        enabled: false,
      },
      { status: 503 }
    )
  }
  const { id: raw } = await ctx.params
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  const item = getWikiItem(id)
  if (!item) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  return NextResponse.json({ item })
}
