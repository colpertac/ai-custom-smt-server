import type { Metadata } from "next"

import { AdminPlayersPanel } from "@/features/admin/components/AdminPlayersPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Players",
}

export default async function AdminPlayersPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Who is online right now — character, account, zone, and map position.
        Auto-refreshes; studio mannequins are marked.
      </p>
      <AdminPlayersPanel />
    </div>
  )
}
