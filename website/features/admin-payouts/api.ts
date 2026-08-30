import { fetcher, type ApiErrorBody } from "@/lib/fetcher"
import { api } from "@/lib/kyClient"
import type {
  DungeonPayoutFile,
  PayoutListItem,
} from "@/lib/dungeon-payout-types"

export type { PayoutListItem }

export const fetchAdminPayouts = () =>
  fetcher<PayoutListItem[]>("admin/payouts")

export const fetchAdminPayout = (id: string) =>
  fetcher<DungeonPayoutFile>(`admin/payouts/${encodeURIComponent(id)}`)

export const createAdminPayout = (payload: {
  id: string
  name: string
  instanceId: number
}) =>
  fetcher<{ id: string }>("admin/payouts", {
    method: "POST",
    json: payload,
  })

export const saveAdminPayout = (id: string, body: DungeonPayoutFile) =>
  fetcher<{ id: string }>(`admin/payouts/${encodeURIComponent(id)}`, {
    method: "PUT",
    json: body,
  })

export const deleteAdminPayout = (id: string) =>
  fetcher<{ id: string }>(`admin/payouts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })

async function downloadBlob(path: string, filename: string): Promise<void> {
  const response = await api(path)
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const errorData = (await response.json()) as Partial<ApiErrorBody>
      if (typeof errorData?.message === "string" && errorData.message) {
        message = errorData.message
      }
    } catch {
      /* keep defaults */
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Fetch zip via XHR so App Router does not soft-navigate the `<a href>`. */
export function downloadAdminPayoutZip(id: string): Promise<void> {
  return downloadBlob(
    `admin/payouts/${encodeURIComponent(id)}/export`,
    `ai_custom_payout_${id}.zip`
  )
}

export function downloadAdminPayoutsZipAll(): Promise<void> {
  return downloadBlob(
    "admin/payouts/export-all",
    "ai_custom_payouts_all.zip"
  )
}
