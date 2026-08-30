import { notifyLaneAPendingChanged } from "@/features/admin/lane-a-pending"
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
