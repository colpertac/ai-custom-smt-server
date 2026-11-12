import type { Metadata } from "next"

import { StudioPortraitClearCard } from "@/features/admin/components/StudioPortraitClearCard"
import { StudioPortraitQueueCard } from "@/features/admin/components/StudioPortraitQueueCard"
import { StudioStatusCard } from "@/features/admin/components/StudioStatusCard"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Portraits",
}

/**
 * Armory portraits: status (live stats + three.js render worker, avatar/docs/WORKER.md),
 * queue, clear. Connection settings come from deploy/install.sh (zero-config).
 */
export default async function AdminStudioPage() {
  await requireAdmin()

  return (
    <div className="w-full space-y-3">
      <StudioStatusCard />
      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <StudioPortraitQueueCard />
        <StudioPortraitClearCard />
      </div>
    </div>
  )
}
