import type { Metadata } from "next"

import { AdminReportsPanel } from "@/features/admin/components/AdminReportsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Reports",
}

export default async function AdminReportsPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Player abuse reports from the client report UI. Open a ticket to see
        comments and chat evidence from the 30 minutes before the report.
      </p>
      <AdminReportsPanel />
    </div>
  )
}
