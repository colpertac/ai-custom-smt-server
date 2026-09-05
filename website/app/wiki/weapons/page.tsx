import type { Metadata } from "next"

import { countWikiItems } from "@/lib/wiki-catalog"
import { WikiBrowsePanel } from "@/features/wiki/components/WikiBrowsePanel"

export const metadata: Metadata = {
  title: "Weapons — Item wiki",
}

export default function WikiWeaponsPage() {
  return (
    <WikiBrowsePanel category="weapons" totalCount={countWikiItems("weapons")} />
  )
}
