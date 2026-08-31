import { WikiShell } from "@/features/wiki/components/WikiShell"
import { WikiUnavailable } from "@/features/wiki/components/WikiUnavailable"
import { isWikiAvailable } from "@/lib/wiki-availability"

export default function WikiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isWikiAvailable()) {
    return <WikiUnavailable />
  }
  return <WikiShell>{children}</WikiShell>
}
