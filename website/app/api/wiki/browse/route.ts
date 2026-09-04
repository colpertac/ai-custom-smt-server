import { type NextRequest, NextResponse } from "next/server"

import {
  searchWikiCatalog,
  type WikiItemCategory,
  type WikiStatBucket,
} from "@/content/wiki"
import { isWikiAvailable } from "@/lib/wiki-availability"

const CATEGORIES = new Set<WikiItemCategory | "all">([
  "weapons",
  "armor",
  "items",
  "all",
])

const STAT_BUCKETS = new Set<WikiStatBucket>(["basic", "characteristic", "any"])

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
  const stat = req.nextUrl.searchParams.get("stat") ?? undefined
  const genderRaw = req.nextUrl.searchParams.get("gender")
  const gender =
    genderRaw === "0" || genderRaw === "1"
      ? (Number(genderRaw) as 0 | 1)
      : undefined
  const statBucketRaw =
    req.nextUrl.searchParams.get("statBucket") ?? "any"
  if (!STAT_BUCKETS.has(statBucketRaw as WikiStatBucket)) {
    return NextResponse.json(
      { error: "statBucket must be basic, characteristic, or any" },
      { status: 400 }
    )
  }
  const statMinRaw = req.nextUrl.searchParams.get("statMin")
  const statMin =
    statMinRaw != null && Number.isFinite(Number(statMinRaw))
      ? Math.max(0, Number(statMinRaw))
      : undefined

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
    stat,
    statBucket: statBucketRaw as WikiStatBucket,
    statMin,
    gender,
    limit,
    offset,
  })
  return NextResponse.json(result)
}
