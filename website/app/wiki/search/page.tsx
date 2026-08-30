import type { Metadata } from "next"
import { Suspense } from "react"

import { WikiSearchPanel } from "@/features/wiki/components/WikiSearchPanel"

export const metadata: Metadata = {
  title: "Search — Item wiki",
}

export default function WikiSearchPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading search…</p>
      }
    >
      <WikiSearchPanel />
    </Suspense>
  )
}
