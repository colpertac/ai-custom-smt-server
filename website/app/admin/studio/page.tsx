import type { Metadata } from "next"

import { StudioDressPanel } from "@/features/admin/components/StudioDressPanel"
import { StudioRenderWorkerCard } from "@/features/admin/components/StudioRenderWorkerCard"
import { requireAdmin } from "@/features/auth/server"
import { getPortraitRendererMode } from "@/lib/portrait-render-mode"

export const metadata: Metadata = {
  title: "Portrait studio",
}

export default async function AdminStudioPage() {
  await requireAdmin()
  const threeMode = getPortraitRendererMode() === "three"

  return (
    <div className="w-full space-y-2">
      {threeMode ? <StudioRenderWorkerCard /> : null}
      <p className="text-xs text-muted-foreground">
        Ops console for Wine mannequins — connection, clients, dress, preview,
        login debug. Agent on the Wine host:{" "}
        <span className="font-mono text-foreground">./studio up</span>.
        {threeMode
          ? " Armory portraits use the render worker above; Wine controls stay for fallback (PORTRAIT_RENDERER=wine)."
          : null}
      </p>
      <StudioDressPanel />
    </div>
  )
}
