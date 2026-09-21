import type { Metadata } from "next"

import { listDevils } from "@/lib/devil-catalog"
import { WikiDemonsPanel } from "@/features/wiki/components/WikiDemonsPanel"

export const metadata: Metadata = {
  title: "Demons — Item wiki",
}

export default function WikiDemonsPage() {
  return <WikiDemonsPanel demons={listDevils()} />
}
