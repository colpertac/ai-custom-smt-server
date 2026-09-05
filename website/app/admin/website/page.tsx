import type { Metadata } from "next"

import { AdminWatchdogPanel } from "@/features/admin-watchdog/components/AdminWatchdogPanel"
import { AdminWebsitePanel } from "@/features/admin-website/components/AdminWebsitePanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Website",
}

export default async function AdminWebsitePage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Customize the site name, icon, About page, and server crash watchdog.
        Settings are stored in the website database — no rebuild required.
      </p>
      <AdminWebsitePanel />
      <AdminWatchdogPanel />
    </div>
  )
}

