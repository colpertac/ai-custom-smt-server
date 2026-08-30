"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  fetchReportRewardDungeon,
  fetchReportRewardDungeons,
  fetchReportRewardGlobal,
  saveReportRewardDungeon,
  saveReportRewardGlobal,
  setAllReportRewardsEnabled,
} from "@/features/admin-report-rewards/api"
import type {
  ReportRewardDungeonFile,
  ReportRewardGlobalFile,
  ReportRewardListItem,
} from "@/lib/report-reward-types"

const ADMIN_LOOT_STALE_MS = 60_000

export function useReportRewardGlobal() {
  return useQuery({
    queryKey: ["admin", "report-rewards", "global"],
    queryFn: fetchReportRewardGlobal,
    staleTime: ADMIN_LOOT_STALE_MS,
    refetchOnWindowFocus: false,
  })
}

export function useSaveReportRewardGlobal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ReportRewardGlobalFile) => saveReportRewardGlobal(body),
    onSuccess: (_data, body) => {
      queryClient.setQueryData(
        ["admin", "report-rewards", "global"],
        body
      )
    },
  })
}

export function useReportRewardDungeons() {
  return useQuery({
    queryKey: ["admin", "report-rewards", "dungeons"],
    queryFn: fetchReportRewardDungeons,
    staleTime: ADMIN_LOOT_STALE_MS,
    refetchOnWindowFocus: false,
  })
}

export function useReportRewardDungeon(id: string | null) {
  return useQuery({
    queryKey: ["admin", "report-rewards", "dungeon", id],
    queryFn: () => fetchReportRewardDungeon(id!),
    enabled: id != null,
    staleTime: ADMIN_LOOT_STALE_MS,
    refetchOnWindowFocus: false,
  })
}

function patchDungeonListItem(
  list: ReportRewardListItem[] | undefined,
  file: ReportRewardDungeonFile
): ReportRewardListItem[] | undefined {
  if (!list) return list
  const d = file.dungeon
  return list.map((row) =>
    row.id === d.id
      ? {
          ...row,
          enabled: d.enabled,
          dropCount: d.drops.length,
        }
      : row
  )
}

export function useSaveReportRewardDungeon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: ReportRewardDungeonFile
    }) => saveReportRewardDungeon(id, body),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData(
        ["admin", "report-rewards", "dungeon", vars.id],
        vars.body
      )
      queryClient.setQueryData(
        ["admin", "report-rewards", "dungeons"],
        (old: ReportRewardListItem[] | undefined) =>
          patchDungeonListItem(old, vars.body)
      )
    },
  })
}

/** Instant grid label before autosave completes. */
export function usePatchReportRewardDungeonList() {
  const queryClient = useQueryClient()
  return (file: ReportRewardDungeonFile) => {
    queryClient.setQueryData(
      ["admin", "report-rewards", "dungeons"],
      (old: ReportRewardListItem[] | undefined) =>
        patchDungeonListItem(old, file)
    )
  }
}

export function useSetAllReportRewardsEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => setAllReportRewardsEnabled(enabled),
    onSuccess: (_data, enabled) => {
      queryClient.setQueryData(
        ["admin", "report-rewards", "dungeons"],
        (old: ReportRewardListItem[] | undefined) =>
          old?.map((row) => ({ ...row, enabled }))
      )
      void queryClient.invalidateQueries({
        queryKey: ["admin", "report-rewards", "dungeons"],
      })
    },
  })
}
