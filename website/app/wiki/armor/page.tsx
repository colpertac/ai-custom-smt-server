import type { Metadata } from "next"

import { WikiItemCategoryList } from "@/features/wiki/components/WikiItemCategoryList"

export const metadata: Metadata = {
  title: "Armor — Item DB",
}

export default function WikiArmorPage() {
  return <WikiItemCategoryList category="armor" />
}
