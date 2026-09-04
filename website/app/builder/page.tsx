import type { Metadata } from "next"

import { GearPlannerApp } from "@/features/gear-planner/components/GearPlannerApp"

export const metadata: Metadata = {
  title: "Gear builder",
}

export default function BuilderPage() {
  return <GearPlannerApp />
}
