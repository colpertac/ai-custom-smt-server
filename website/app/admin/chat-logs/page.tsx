import type { Metadata } from "next"

import { AdminChatLogsPanel } from "@/features/admin/components/AdminChatLogsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Chat logs",
}

export default async function AdminChatLogsPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Search persisted player chat (say, shout, tell, party, clan, team).
        Retention is controlled by{" "}
        <code className="text-xs">WorldSharedConfig.ChatLogRetentionDays</code>{" "}
        (0 = keep forever; set N &gt; 0 to prune after N days). Tunable in Admin
        → Config / world.xml
      </p>
      <AdminChatLogsPanel />
    </div>
  )
}
