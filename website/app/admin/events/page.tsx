import type { Metadata } from "next"

import { AdminEventsPanel } from "@/features/admin-events/components/AdminEventsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Seasonal Events",
}

export default async function AdminEventsPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <AdminEventsPanel />
    </div>
  )
}
