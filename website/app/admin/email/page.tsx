import type { Metadata } from "next"

import { AdminEmailPanel } from "@/features/admin-email/components/AdminEmailPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "Email",
}

export default async function AdminEmailPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Configure Resend for welcome and forgot-password email. Settings are
        stored in the website database — no SSH or editing{" "}
        <code className="text-[0.65rem]">.env</code> required.
      </p>
      <AdminEmailPanel />
    </div>
  )
}
