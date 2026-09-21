import type { Metadata } from "next"
import { Suspense } from "react"

import { listDevils } from "@/lib/devil-catalog"
import { WikiDemonsPanel } from "@/features/wiki/components/WikiDemonsPanel"

export const metadata: Metadata = {
  title: "Demons — Item wiki",
}

export default function WikiDemonsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading demons…</p>}>
      <WikiDemonsPanel demons={listDevils()} />
    </Suspense>
  )
}
