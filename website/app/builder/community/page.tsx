import type { Metadata } from "next"

import { CommunityBuildsPanel } from "@/features/gear-planner/components/CommunityBuildsPanel"

export const metadata: Metadata = {
  title: "Community gear builds",
}

export default function CommunityBuildsPage() {
  return <CommunityBuildsPanel />
}
