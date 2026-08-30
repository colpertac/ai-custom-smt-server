import type { Metadata } from "next"

import { AccountImportPanel } from "@/features/admin/components/AccountImportPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Import account",
}

export default async function AdminImportPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload an exported account XML to create or restore a player account on
        this server.
      </p>
      <AccountImportPanel />
    </div>
  )
}
