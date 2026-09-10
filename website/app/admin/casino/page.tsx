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
        Tune Golden Ark coin costs and payouts — drafts autosave. Use{" "}
        <span className="text-foreground">Publish &amp; restart</span> on
        Overview so players get the new values (restarts login, then channel).
        Upload the three casino game files here if they are missing — they are
        not shipped in the public server package.
      </p>
      <CasinoRngPanel />
    </div>
  )
}
