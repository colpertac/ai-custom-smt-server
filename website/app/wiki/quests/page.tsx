import type { Metadata } from "next"

import { WikiQuestsPanel } from "@/features/wiki/components/WikiQuestsPanel"
import { listWikiQuestRows } from "@/lib/wiki-quest-guide"

export const metadata: Metadata = {
  title: "Quests — Item wiki",
}

export default function WikiQuestsPage() {
  return <WikiQuestsPanel quests={listWikiQuestRows()} />
}
