import type { Metadata } from "next"

import { AdminWebsitePanel } from "@/features/admin-website/components/AdminWebsitePanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Website",
}

export default async function AdminWebsitePage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Customize the site name, icon, and About page. Settings are stored in
        the website database — no rebuild required.
      </p>
      <AdminWebsitePanel />
    </div>
  )
}
