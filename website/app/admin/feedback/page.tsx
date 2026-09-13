import type { Metadata } from "next"

import { AdminFeedbackPanel } from "@/features/admin/components/AdminFeedbackPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Feedback",
}

export default async function AdminFeedbackPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Website feedback from the public footer form. Separate from in-game
        player reports.
      </p>
      <AdminFeedbackPanel />
    </div>
  )
}
