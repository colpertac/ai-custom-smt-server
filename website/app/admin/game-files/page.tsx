import type { Metadata } from "next"

import { AdminOpsFirstBoot } from "@/features/admin/components/AdminOpsFirstBoot"
import { AdminOpsIngest } from "@/features/admin/components/AdminOpsIngest"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Game files",
}

export default async function AdminGameFilesPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Upload character art, maps, and files players download with the game
        updater.
      </p>
      <AdminOpsFirstBoot />
      <AdminOpsIngest />
    </div>
  )
}
