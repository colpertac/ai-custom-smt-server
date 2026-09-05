import type { Metadata } from "next"

import { AdminSqlPanel } from "@/features/admin/components/AdminSqlPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "SQL",
}

export default async function AdminSqlPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Run read-only SQL against the world database for ad-hoc QA (e.g. richest
        characters). Writes and multi-statement queries are blocked.
      </p>
      <AdminSqlPanel />
    </div>
  )
}
