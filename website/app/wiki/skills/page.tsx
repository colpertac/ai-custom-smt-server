import type { Metadata } from "next"

import { listSkills } from "@/lib/skill-catalog"
import { WikiSkillsPanel } from "@/features/wiki/components/WikiSkillsPanel"

export const metadata: Metadata = {
  title: "Skills — Item wiki",
}

export default function WikiSkillsPage() {
  return <WikiSkillsPanel skills={listSkills()} />
}
