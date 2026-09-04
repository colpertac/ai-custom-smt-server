import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { GearPlannerApp } from "@/features/gear-planner/components/GearPlannerApp"
import { getGearBuildByShareToken } from "@/lib/gear-builds-store"

export const metadata: Metadata = {
  title: "Shared gear build",
}

type Props = { params: Promise<{ token: string }> }

export default async function SharedBuilderPage({ params }: Props) {
  const { token } = await params
  const build = getGearBuildByShareToken(token)
  if (!build) notFound()

  return <GearPlannerApp initialSharePayload={build.payload} />
}
