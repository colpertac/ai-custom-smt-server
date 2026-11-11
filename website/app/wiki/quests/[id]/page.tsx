import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { WikiQuestDetailView } from "@/features/wiki/components/WikiQuestDetailView"
import { getQuestById } from "@/lib/quest-catalog-load"
import { buildQuestWalkthrough } from "@/lib/wiki-quest-guide"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const quest = getQuestById(Number(id))
  return {
    title: quest
      ? `${quest.title ?? `Quest ${quest.id}`} — Quests`
      : "Quest — Item wiki",
  }
}

export default async function WikiQuestPage({ params }: Props) {
  const { id } = await params
  const questId = Number(id)
  if (!Number.isFinite(questId) || questId <= 0) notFound()
  const quest = getQuestById(questId)
  if (!quest) notFound()
  return (
    <WikiQuestDetailView
      quest={quest}
      walkthrough={buildQuestWalkthrough(quest)}
    />
  )
}
