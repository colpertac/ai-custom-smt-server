import type { Metadata } from "next"

import { AdminStorePricesPanel } from "@/features/admin-store-prices/components/AdminStorePricesPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Store",
}

export default async function AdminStorePage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Enable the wiki cart, tune CP pricing, and set per-item exceptions.
        Checkout debits CP and mails ShopProductData items via the lobby
        service account (<span className="font-mono">COMP_ANNOUNCE_*</span>).
      </p>
      <AdminStorePricesPanel />
    </div>
  )
}
