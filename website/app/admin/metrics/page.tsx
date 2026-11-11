import type { Metadata } from "next"

import { AdminPlayerChart } from "@/features/admin/components/AdminPlayerChart"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Metrics",
}

export default async function AdminMetricsPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Concurrent real players over time — same idea as a SteamDB player chart.
        History lives in website data and keeps about 30 days.
      </p>
      <AdminPlayerChart />
    </div>
  )
}
