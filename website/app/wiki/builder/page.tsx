import type { Metadata } from "next"

import { GearPlannerApp } from "@/features/gear-planner/components/GearPlannerApp"

export const metadata: Metadata = {
  title: "Gear builder — Item wiki",
}

export default function WikiBuilderPage() {
  return <GearPlannerApp />
}
