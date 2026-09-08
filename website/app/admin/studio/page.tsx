import type { Metadata } from "next"

import { StudioDressPanel } from "@/features/admin/components/StudioDressPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Portrait studio",
}

export default async function AdminStudioPage() {
  await requireAdmin()

  return (
    <div className="w-full space-y-2">
      <p className="text-xs text-muted-foreground">
        Ops console for Wine mannequins — connection, clients, dress, preview,
        login debug. Agent on the Wine host:{" "}
        <span className="font-mono text-foreground">./studio up</span>.
      </p>
      <StudioDressPanel />
    </div>
  )
}
