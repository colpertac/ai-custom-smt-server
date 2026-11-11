import type { Metadata } from "next"
import { Suspense } from "react"

import { WikiSearchPanel } from "@/features/wiki/components/WikiSearchPanel"
import { listWikiQuestSearchIndex } from "@/lib/quest-catalog-load"

export const metadata: Metadata = {
  title: "Search — Item wiki",
}

export default function WikiSearchPage() {
  const questIndex = listWikiQuestSearchIndex()
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading search…</p>
      }
    >
      <WikiSearchPanel questIndex={questIndex} />
    </Suspense>
  )
}
