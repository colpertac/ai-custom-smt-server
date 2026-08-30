import { notifyLaneAPendingChanged } from "@/features/admin/lane-a-pending"
import { fetcher, type ApiErrorBody } from "@/lib/fetcher"
import { api } from "@/lib/kyClient"
import type { PayoutLiveConflict } from "@/lib/lane-a-publish"
import type {
  DungeonPayoutFile,
  PayoutListItem,
} from "@/lib/dungeon-payout-types"

export type { PayoutListItem, PayoutLiveConflict }

export const fetchAdminPayouts = () =>
  fetcher<PayoutListItem[]>("admin/payouts")

export const fetchAdminPayoutConflicts = () =>
  fetcher<{ conflicts: PayoutLiveConflict[] }>("admin/payouts/conflicts")

export const retireAdminPayoutConflictPackages = () =>
  fetcher<{
    retired: string[]
    skipped: string[]
    conflicts: PayoutLiveConflict[]
  }>("admin/payouts/conflicts", { method: "POST" })

export const fetchAdminPayout = (id: string) =>
  fetcher<DungeonPayoutFile>(`admin/payouts/${encodeURIComponent(id)}`)

export const createAdminPayout = async (payload: {
  id: string
  name: string
  instanceId: number
}) => {
  const result = await fetcher<{ id: string }>("admin/payouts", {
    method: "POST",
    json: payload,
  })
  notifyLaneAPendingChanged()
  return result
}

export const saveAdminPayout = async (id: string, body: DungeonPayoutFile) => {
  const result = await fetcher<{ id: string }>(
    `admin/payouts/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      json: body,
    }
  )
  notifyLaneAPendingChanged()
  return result
}

export const deleteAdminPayout = async (id: string) => {
  const result = await fetcher<{ id: string }>(
    `admin/payouts/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  )
  notifyLaneAPendingChanged()
  return result
}

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
