import type { Metadata } from "next"

import { countWikiItems } from "@/content/wiki"
import { WikiBrowsePanel } from "@/features/wiki/components/WikiBrowsePanel"

export const metadata: Metadata = {
  title: "Items — Item wiki",
}

export default function WikiItemsPage() {
  return (
    <WikiBrowsePanel category="items" totalCount={countWikiItems("items")} />
  )
}
