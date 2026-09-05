import { NextResponse } from "next/server"

import {
  countWikiCatalog,
  countWikiItems,
  getWikiCatalogSource,
  getWikiItemsPayload,
} from "@/lib/wiki-catalog"
import { isWikiAvailable } from "@/lib/wiki-availability"

export async function GET() {
  const enabled = isWikiAvailable()
  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      message:
        "Upload BinaryData (game client files) before the item wiki is enabled",
    })
  }
  const payload = getWikiItemsPayload()
  return NextResponse.json({
    enabled: true,
    message: "Wiki catalog available",
    itemCount: countWikiCatalog(),
    generatedAt: payload.generatedAt,
    source: getWikiCatalogSource(),
    counts: {
      weapons: countWikiItems("weapons"),
      armor: countWikiItems("armor"),
      items: countWikiItems("items"),
    },
  })
}
