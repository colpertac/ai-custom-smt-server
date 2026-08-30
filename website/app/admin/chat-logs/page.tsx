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
        Entries older than 14 days are pruned automatically.
      </p>
      <AdminChatLogsPanel />
    </div>
  )
}
