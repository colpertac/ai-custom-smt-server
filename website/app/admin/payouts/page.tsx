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
        Edit clear CP in the sheet. Boss crate items are under Dungeon loot.
        Use the gear for rare advanced payout settings. Publish from Overview
        when ready.
      </p>
      <DungeonPayoutsPanel />
    </div>
  )
}
