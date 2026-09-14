import type { Metadata } from "next"

import { AdminOpsBackup } from "@/features/admin/components/AdminOpsBackup"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Backups",
}

export default async function AdminBackupsPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Cold backup of game DBs and website data on this compose host. Enable
        rclone sync so a destroyed VM is still recoverable from an off-box
        copy.
      </p>
      <AdminOpsBackup />
    </div>
  )
}
