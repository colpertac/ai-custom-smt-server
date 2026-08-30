import type { Metadata } from "next"

import { AdminOpsFirstBoot } from "@/features/admin/components/AdminOpsFirstBoot"
import { AdminOpsHealth } from "@/features/admin/components/AdminOpsHealth"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Admin",
}

export default async function AdminPage() {
  const session = await requireAdmin()

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Signed in as{" "}
        <span className="text-foreground">{session.username}</span>. Check
        status, start or stop the game servers, and publish shops &amp; rewards
        from here.
      </p>

      <AdminOpsFirstBoot />

      <AdminOpsHealth />
    </div>
  )
}
