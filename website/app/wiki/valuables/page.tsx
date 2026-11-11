import type { Metadata } from "next"

import { listValuables } from "@/lib/valuable-catalog"
import { WikiValuablesPanel } from "@/features/wiki/components/WikiValuablesPanel"

export const metadata: Metadata = {
  title: "Valuables — Item wiki",
}

export default function WikiValuablesPage() {
  return <WikiValuablesPanel valuables={listValuables()} />
}
