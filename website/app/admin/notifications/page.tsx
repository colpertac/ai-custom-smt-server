import type { Metadata } from "next"

import { AdminNotificationsPanel } from "@/features/admin-notifications/components/AdminNotificationsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Notifications",
}

export default async function AdminNotificationsPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Configure the Discord webhook and choose which events ping the channel.
        Settings are stored in the website database — no rebuild required.
      </p>
      <AdminNotificationsPanel />
    </div>
  )
}
