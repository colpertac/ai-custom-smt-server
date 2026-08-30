import type { Metadata } from "next"

import { AdminPromosPanel } from "@/features/admin/components/AdminPromosPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Promos",
}

export default async function AdminPromosPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Create and manage promo codes. Codes must be exactly 16 letters (A–Z)
        to match the client Promotion Code field. Players redeem them in-game;
        rewards arrive in Post as shop products.
      </p>
      <AdminPromosPanel />
    </div>
  )
}
