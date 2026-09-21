import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getDevil, listDevilFamily } from "@/lib/devil-catalog"
import { WikiDemonDetailView } from "@/features/wiki/components/WikiDemonDetailView"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const demon = getDevil(Number(id))
  return {
    title: demon ? `${demon.name} — Demon wiki` : "Demon — Demon wiki",
  }
}

export default async function WikiDemonPage({ params }: Props) {
  const { id } = await params
  const demonId = Number(id)
  if (!Number.isFinite(demonId)) notFound()
  const demon = getDevil(demonId)
  if (!demon) notFound()

  const family = listDevilFamily(demon.baseDemonId)
  const mitama =
    demon.mitamaFusionId > 0 ? (getDevil(demon.mitamaFusionId) ?? null) : null

  return (
    <WikiDemonDetailView demon={demon} family={family} mitama={mitama} />
  )
}
