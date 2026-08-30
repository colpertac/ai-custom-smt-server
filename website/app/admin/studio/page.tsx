import type { Metadata } from "next"

import { StudioDressPanel } from "@/features/admin/components/StudioDressPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Portrait studio",
}

export default async function AdminStudioPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Copy gear onto mannequin characters that are logged into the game world
        (for armory portrait captures). Offline here means the character is not
        in-world yet.
      </p>
      <StudioDressPanel />
    </div>
  )
}
