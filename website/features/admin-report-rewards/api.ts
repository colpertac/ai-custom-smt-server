import { notifyLaneAPendingChanged } from "@/features/admin/lane-a-pending"
import { api } from "@/lib/kyClient"
import { fetcher } from "@/lib/fetcher"
import type {
  ReportRewardDungeonFile,
  ReportRewardGlobalFile,
  ReportRewardListItem,
} from "@/lib/report-reward-types"

export const fetchReportRewardGlobal = () =>
  fetcher<ReportRewardGlobalFile>("admin/report-rewards/global")

export const saveReportRewardGlobal = async (body: ReportRewardGlobalFile) => {
  const result = await fetcher<{ ok: true }>("admin/report-rewards/global", {
    method: "PUT",
    json: body,
  })
  notifyLaneAPendingChanged()
  return result
}

export const fetchReportRewardDungeons = () =>
  fetcher<ReportRewardListItem[]>("admin/report-rewards")

export const fetchReportRewardDungeon = (id: string) =>
  fetcher<ReportRewardDungeonFile>(
    `admin/report-rewards/${encodeURIComponent(id)}`
  )

export const saveReportRewardDungeon = async (
  id: string,
  body: ReportRewardDungeonFile
) => {
  const result = await fetcher<{ id: string }>(
    `admin/report-rewards/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      json: body,
    }
  )
  notifyLaneAPendingChanged()
  return result
}

export const setAllReportRewardsEnabled = async (enabled: boolean) => {
  const result = await fetcher<{ updated: number; total: number }>(
    "admin/report-rewards/bulk-enabled",
    {
      method: "POST",
      json: { enabled },
    }
  )
  notifyLaneAPendingChanged()
  return result
}

/** Zip of CEventMessageData2 + INSTALL.txt for custom NPC package dialog labels. */
export async function downloadCustomNpcClientPatch(
  global: ReportRewardGlobalFile
): Promise<void> {
  const response = await api("admin/report-rewards/client-overlay", {
    method: "POST",
    json: global,
  })
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const errorData = (await response.json()) as { message?: string }
      if (errorData.message) message = errorData.message
    } catch {
      /* keep default */
    }
    throw new Error(message)
  }
  const blob = await response.blob()
  const disposition = response.headers.get("Content-Disposition") ?? ""
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match?.[1] ?? "smt-custom-npc-dialog.zip"
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
