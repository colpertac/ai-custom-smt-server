import type { Metadata } from "next"

import { CompShopsPanel } from "@/features/admin-shops/components/CompShopsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Shops",
}

export default async function AdminShopsPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Edit shop prices, tabs, and products in your draft. Use{" "}
        <span className="text-foreground">Publish shops &amp; payouts</span> on
        Overview to push them live.
      </p>
      <CompShopsPanel />
    </div>
  )
}
