import { Suspense } from "react"
import type { Metadata } from "next"

import { DungeonLootPanel } from "@/features/admin-dungeon-loot/components/DungeonLootPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Dungeon loot",
}

export default async function AdminDungeonLootPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Add items to the boss crate per dungeon — weapons, gems, reports, etc.
        Mark a drop as tradable if players exchange it for CP. Publish from
        Overview when you want it live.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <DungeonLootPanel />
      </Suspense>
    </div>
  )
}
