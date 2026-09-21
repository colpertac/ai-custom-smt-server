import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getSkill } from "@/lib/skill-catalog"
import { WikiSkillDetailView } from "@/features/wiki/components/WikiSkillDetailView"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const skill = getSkill(Number(id))
  return {
    title: skill ? `${skill.name} — Skills` : "Skill — Item wiki",
  }
}

export default async function WikiSkillPage({ params }: Props) {
  const { id } = await params
  const skill = getSkill(Number(id))
  if (!skill) notFound()
  return <WikiSkillDetailView skill={skill} />
}
