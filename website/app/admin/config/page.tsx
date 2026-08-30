import type { Metadata } from "next"

import { ServerConfigPanel } from "@/features/admin-config/components/ServerConfigPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Server config",
}

export default async function AdminConfigPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Edit login, world, and game channel settings in your draft. Save, then
        apply &amp; restart to push them live.
      </p>
      <ServerConfigPanel />
    </div>
  )
}
