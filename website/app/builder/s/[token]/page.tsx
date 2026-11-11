import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { GearPlannerApp } from "@/features/gear-planner/components/GearPlannerApp"
import {
  getGearBuildByShareToken,
  userLikesBuild,
} from "@/lib/gear-builds-store"
import { requireWebSession } from "@/lib/web-session"

export const metadata: Metadata = {
  title: "Shared gear build",
}

type Props = { params: Promise<{ token: string }> }

export default async function SharedBuilderPage({ params }: Props) {
  const { token } = await params
  const build = getGearBuildByShareToken(token)
  if (!build) notFound()

  const session = await requireWebSession()
  const likedByMe = session
    ? userLikesBuild(build.id, session.username)
    : false

  return (
    <GearPlannerApp
      initialSharePayload={build.payload}
      shareToken={token}
      shareName={build.name}
      shareBuildId={build.id}
      shareLikeCount={build.likeCount}
      shareLikedByMe={likedByMe}
    />
  )
}
