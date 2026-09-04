import { WikiUnavailable } from "@/features/wiki/components/WikiUnavailable"
import { isWikiAvailable } from "@/lib/wiki-availability"

export default function BuilderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isWikiAvailable()) {
    return <WikiUnavailable />
  }
  return (
    <div className="site-atmosphere flex min-h-[calc(100dvh-3.5rem)] w-full flex-col">
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  )
}
