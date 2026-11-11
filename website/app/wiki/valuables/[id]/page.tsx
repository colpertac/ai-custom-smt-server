import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getValuable } from "@/lib/valuable-catalog"
import { WikiValuableDetailView } from "@/features/wiki/components/WikiValuableDetailView"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const valuable = getValuable(Number(id))
  return {
    title: valuable
      ? `${valuable.name || `Valuable ${valuable.id}`} — Valuables`
      : "Valuable — Item wiki",
  }
}

export default async function WikiValuablePage({ params }: Props) {
  const { id } = await params
  const valuable = getValuable(Number(id))
  if (!valuable) notFound()
  return <WikiValuableDetailView valuable={valuable} />
}
