import type { Metadata } from "next"

import { AdminDownloadPanel } from "@/features/admin-download/components/AdminDownloadPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Download",
}

export default async function AdminDownloadPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Prep a client for your realm, then publish the download link players
        use. Players never need this page.
      </p>
      <AdminDownloadPanel />
    </div>
  )
}
