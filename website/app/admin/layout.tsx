import { AdminShell } from "@/features/admin/components/AdminShell"
import { requireAdmin } from "@/features/auth/server"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAdmin()

  return <AdminShell username={session.username}>{children}</AdminShell>
}
