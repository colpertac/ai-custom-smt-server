import type { Metadata } from "next"

import { AdminNewsPanel } from "@/features/admin-news/components/AdminNewsPanel"
import { requireAdmin } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "News",
}

export default async function AdminNewsPage() {
  await requireAdmin()

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Create and edit realm news. Body supports Markdown (headings, lists,
        links, tables). Unpublished posts stay off the public news page.
      </p>
      <AdminNewsPanel />
    </div>
  )
}
