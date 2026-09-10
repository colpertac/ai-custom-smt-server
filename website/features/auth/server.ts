import { redirect } from "next/navigation"

import { isAdminLevel } from "@/lib/admin-level"
import { readSession } from "@/lib/session"
import type { SessionUser } from "@/features/auth/types/session"

export async function getServerUser(): Promise<SessionUser | null> {
  const session = await readSession()
  if (!session) return null
  return {
    username: session.username,
    dispName: session.dispName,
    userLevel: session.userLevel,
    mustChangePassword: Boolean(session.mustChangePassword),
    offlineOps: Boolean(session.offlineOps),
  }
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getServerUser()
  if (!user) redirect("/login")
  return user
}

export async function redirectIfLoggedIn(to = "/account"): Promise<void> {
  if (await getServerUser()) redirect(to)
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth()
  if (!isAdminLevel(user.userLevel)) redirect("/account")
  // Offline recovery must reach Admin → Start even with default password.
  if (user.mustChangePassword && !user.offlineOps) redirect("/account")
  return user
}
