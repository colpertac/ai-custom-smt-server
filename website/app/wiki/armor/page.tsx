import type { Metadata } from "next"

import { countWikiItems } from "@/content/wiki"
import { WikiBrowsePanel } from "@/features/wiki/components/WikiBrowsePanel"

export const metadata: Metadata = {
  title: "Armor — Item wiki",
}

export default function WikiArmorPage() {
  return (
    <WikiBrowsePanel category="armor" totalCount={countWikiItems("armor")} />
  )
}
