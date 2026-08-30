import type { Metadata } from "next"

import { WikiItemCategoryList } from "@/features/wiki/components/WikiItemCategoryList"

export const metadata: Metadata = {
  title: "Weapons — Item DB",
}

export default function WikiWeaponsPage() {
  return <WikiItemCategoryList category="weapons" />
}
