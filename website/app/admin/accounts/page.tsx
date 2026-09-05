import type { Metadata } from "next"

import { AccountImportPanel } from "@/features/admin/components/AccountImportPanel"
import { AdminAccountsPanel } from "@/features/admin/components/AdminAccountsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Accounts",
}

export default async function AdminAccountsPage() {
  await requireAdmin()

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Look up players, change CP / tickets / admin level, or disable an
          account.
        </p>
        <AdminAccountsPanel />
      </div>
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Import account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload an exported account XML to create or restore a player account
            on this server.
          </p>
        </div>
        <AccountImportPanel />
      </div>
    </div>
  )
}
