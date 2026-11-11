import { WikiShell } from "@/features/wiki/components/WikiShell"
import { WikiUnavailable } from "@/features/wiki/components/WikiUnavailable"
import { listDevils } from "@/lib/devil-catalog"
import { listSkills } from "@/lib/skill-catalog"
import { listValuables } from "@/lib/valuable-catalog"
import { isWikiAvailable } from "@/lib/wiki-availability"

export default function WikiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isWikiAvailable()) {
    return <WikiUnavailable />
  }
  return (
    <WikiShell
      demonCount={listDevils().length}
      skillCount={listSkills().length}
      valuableCount={listValuables().length}
    >
      {children}
    </WikiShell>
  )
}
