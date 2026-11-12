import type { Metadata } from "next"

import { StudioConnectionCard } from "@/features/admin/components/StudioConnectionCard"
import { StudioPortraitClearCard } from "@/features/admin/components/StudioPortraitClearCard"
import { StudioPortraitQueueCard } from "@/features/admin/components/StudioPortraitQueueCard"
import { StudioRenderWorkerCard } from "@/features/admin/components/StudioRenderWorkerCard"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Portraits",
}

/** Armory portraits: three.js render worker (avatar/docs/WORKER.md), queue, clear, settings. */
export default async function AdminStudioPage() {
  await requireAdmin()

  return (
    <div className="w-full space-y-3">
      <StudioRenderWorkerCard />
      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <StudioPortraitQueueCard />
        <div className="space-y-3 min-w-0">
          <StudioPortraitClearCard />
          <StudioConnectionCard />
        </div>
      </div>
    </div>
  )
}
