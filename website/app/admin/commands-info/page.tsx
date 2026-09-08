import type { Metadata } from "next"

import { GmCommandsInfoPanel } from "@/features/admin/components/GmCommandsInfoPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "GM commands",
}

export default async function AdminCommandsInfoPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        In-game channel GM commands (<code className="text-xs">@…</code>). Type
        them in chat. Access requires{" "}
        <span className="font-medium text-foreground">
          UserLevel ≥ each command&apos;s threshold
        </span>
        ; higher levels unlock every lower tier. Thresholds are stock{" "}
        <code className="text-xs">GM_CMD_LVL_*</code> values (editable under
        Config → Constants). New accounts get{" "}
        <code className="text-xs">RegistrationUserLevel</code> from lobby
        config.
      </p>
      <GmCommandsInfoPanel />
    </div>
  )
}
