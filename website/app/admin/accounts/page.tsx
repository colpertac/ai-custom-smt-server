import type { Metadata } from "next"

import { AdminAccountsPanel } from "@/features/admin/components/AdminAccountsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Accounts",
}

export default async function AdminAccountsPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Look up players, change CP / tickets / admin level, or disable an
        account.
      </p>
      <AdminAccountsPanel />
    </div>
  )
}
