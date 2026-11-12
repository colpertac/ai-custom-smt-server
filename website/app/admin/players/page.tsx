import type { Metadata } from "next"

import { AdminPlayerChart } from "@/features/admin/components/AdminPlayerChart"
import { AdminPlayersPanel } from "@/features/admin/components/AdminPlayersPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Players",
}

export default async function AdminPlayersPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Live roster and concurrent players over time. Auto-refreshes.
      </p>
      <AdminPlayerChart />
      <AdminPlayersPanel />
    </div>
  )
}
