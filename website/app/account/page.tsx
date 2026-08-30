import { AccountPanel } from "@/features/account/components/AccountPanel"
import { requireAuth } from "@/features/auth/server"

export const metadata = { title: "Account" }

export default async function AccountPage() {
  await requireAuth()
  return <AccountPanel />
}
