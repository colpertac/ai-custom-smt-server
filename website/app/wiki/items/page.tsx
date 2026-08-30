import type { Metadata } from "next"

import { WikiItemCategoryList } from "@/features/wiki/components/WikiItemCategoryList"

export const metadata: Metadata = {
  title: "Items — Item DB",
}

export default function WikiItemsPage() {
  return <WikiItemCategoryList category="items" />
}
