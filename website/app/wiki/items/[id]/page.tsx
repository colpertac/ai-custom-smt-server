import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getWikiItem } from "@/content/wiki"
import { WikiItemDetailView } from "@/features/wiki/components/WikiItemDetailView"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const item = getWikiItem(Number(id))
  return { title: item ? `${item.name} — Item wiki` : "Item — Item wiki" }
}

export default async function WikiItemPage({ params }: Props) {
  const { id } = await params
  const item = getWikiItem(Number(id))
  if (!item) notFound()

  return <WikiItemDetailView item={item} />
}
