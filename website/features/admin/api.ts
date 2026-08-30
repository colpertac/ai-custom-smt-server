import { fetcher } from "@/lib/fetcher"
import type { SessionUser } from "@/features/auth/types/session"

export type AdminAccount = SessionUser & {
  username: string
}

export const fetchAdminAccounts = () =>
  fetcher<AdminAccount[]>("admin/accounts")

export const updateAdminAccount = (
  username: string,
  payload: Record<string, unknown>
) =>
  fetcher<{ username: string; selfUpdated?: boolean }>(
    `admin/accounts/${encodeURIComponent(username)}`,
    { method: "POST", json: payload }
  )

export const deleteAdminAccount = (username: string) =>
  fetcher<{ username: string; selfDeleted?: boolean }>(
    `admin/accounts/${encodeURIComponent(username)}`,
    { method: "DELETE" }
  )
