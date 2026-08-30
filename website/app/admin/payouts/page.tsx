import type { Metadata } from "next"

import { DungeonPayoutsPanel } from "@/features/admin-payouts/components/DungeonPayoutsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Payouts",
}

export default async function AdminPayoutsPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Set CP, crate loot, and clear rewards per dungeon. Edits stay in your
        draft until you publish shops &amp; rewards from Overview.
      </p>
      <DungeonPayoutsPanel />
    </div>
  )
}
