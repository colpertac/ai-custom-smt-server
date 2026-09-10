import type { Metadata } from "next"

import { CasinoRngPanel } from "@/features/admin-casino/components/CasinoRngPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Casino",
}

export default async function AdminCasinoPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Tune Golden Ark coin costs and payouts, then apply so players see the
        new values. Upload the three casino game files here if they are
        missing — they are not shipped in the public server package.
      </p>
      <CasinoRngPanel />
    </div>
  )
}
