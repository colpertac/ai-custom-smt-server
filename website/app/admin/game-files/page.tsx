import type { Metadata } from "next"

import {
  AdminOpsClientUpload,
  AdminOpsServerUpload,
} from "@/features/admin/components/AdminOpsIngest"
import { AdminOpsFirstBoot } from "@/features/admin/components/AdminOpsFirstBoot"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Game files",
}

export default async function AdminGameFilesPage() {
  await requireAdmin()

  return (
    <div className="space-y-8">
      <p className="text-xs text-muted-foreground">
        Server uploads update the live game channel. Client uploads publish files
        through ImagineUpdate.
      </p>
      <AdminOpsFirstBoot />
      <AdminOpsServerUpload />
      <AdminOpsClientUpload />
    </div>
  )
}
