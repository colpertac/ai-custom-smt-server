import type { Metadata } from "next"

import { AdminRecoveryPanel } from "@/features/admin/components/AdminRecoveryPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Recovery",
}

export default async function AdminRecoveryPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Panic path when lobby/world/channel will not start after a bad Config,
        COMP shop, or Dungeon loot publish. Every restore snapshots live state
        first. Prefer <strong>Restore shops &amp; loot</strong> when channel dies
        right after Publish.
      </p>
      <AdminRecoveryPanel />
    </div>
  )
}
