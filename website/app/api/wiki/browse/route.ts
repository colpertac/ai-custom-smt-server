import { type NextRequest, NextResponse } from "next/server"

import {
  searchWikiCatalog,
  type WikiItemCategory,
} from "@/content/wiki"
import { isWikiAvailable } from "@/lib/wiki-availability"

const CATEGORIES = new Set<WikiItemCategory | "all">([
  "weapons",
  "armor",
  "items",
  "all",
])

export async function GET(req: NextRequest) {
  if (!isWikiAvailable()) {
    return NextResponse.json(
      {
        error: "Wiki unavailable until BinaryData is uploaded",
        enabled: false,
      },
      { status: 503 }
    )
  }

  const categoryParam = req.nextUrl.searchParams.get("category") ?? "all"
  if (!CATEGORIES.has(categoryParam as WikiItemCategory | "all")) {
    return NextResponse.json(
      { error: "category must be weapons, armor, items, or all" },
      { status: 400 }
    )
  }

  const q = req.nextUrl.searchParams.get("q") ?? ""
  const slot = req.nextUrl.searchParams.get("slot") ?? undefined
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), 200)
    : 100
  const offsetRaw = Number(req.nextUrl.searchParams.get("offset") ?? 0)
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.floor(offsetRaw))
    : 0

  const result = searchWikiCatalog(q, {
    category: categoryParam as WikiItemCategory | "all",
    slot,
    limit,
    offset,
  })
  return NextResponse.json(result)
}
