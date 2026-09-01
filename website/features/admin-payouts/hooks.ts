"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  batchSaveAdminPayoutCp,
  createAdminPayout,
  deleteAdminPayout,
  fetchAdminPayout,
  fetchAdminPayoutConflicts,
  fetchAdminPayouts,
  retireAdminPayoutConflictPackages,
  saveAdminPayout,
} from "@/features/admin-payouts/api"
import {
  createAdminCpPreset,
  deleteAdminCpPreset,
  duplicateAdminCpPreset,
  fetchAdminCpPresets,
  restoreDefaultAdminCpPresets,
  updateAdminCpPreset,
} from "@/features/admin-payouts/cp-presets-api"
import { notifyLaneAPendingChanged } from "@/features/admin/lane-a-pending"
import type { EconomyPresetInput } from "@/lib/cp-presets-store"
import type { DungeonPayoutFile } from "@/lib/dungeon-payout-types"

export function useAdminPayouts() {
  return useQuery({
    queryKey: ["admin", "payouts"],
    queryFn: fetchAdminPayouts,
  })
}

export function useAdminPayoutConflicts() {
  return useQuery({
    queryKey: ["admin", "payouts", "conflicts"],
    queryFn: fetchAdminPayoutConflicts,
  })
}

export function useRetireAdminPayoutConflictPackages() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => retireAdminPayoutConflictPackages(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "payouts", "conflicts"],
      })
      notifyLaneAPendingChanged()
    },
  })
}

export function useAdminPayout(id: string | null) {
  return useQuery({
    queryKey: ["admin", "payouts", id],
    queryFn: () => fetchAdminPayout(id!),
    enabled: id != null,
  })
}

export function useCreateAdminPayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; name: string; instanceId: number }) =>
      createAdminPayout(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "payouts"] })
    },
  })
}

export function useSaveAdminPayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DungeonPayoutFile }) =>
      saveAdminPayout(id, body),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "payouts"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin", "payouts", vars.id],
      })
    },
  })
}

export function useBatchSaveAdminPayoutCp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (updates: { id: string; cp: number }[]) =>
      batchSaveAdminPayoutCp(updates),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "payouts"] })
      for (const id of result.updated) {
        void queryClient.invalidateQueries({
          queryKey: ["admin", "payouts", id],
        })
      }
    },
  })
}

export function useDeleteAdminPayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAdminPayout(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "payouts"] })
      void queryClient.removeQueries({ queryKey: ["admin", "payouts", id] })
    },
  })
}

/** Save many payouts sequentially; invalidates list once at the end. */
export function useSaveAllAdminPayouts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (items: { id: string; body: DungeonPayoutFile }[]) => {
      const results: { id: string }[] = []
      for (const item of items) {
        results.push(await saveAdminPayout(item.id, item.body))
      }
      return results
    },
    onSuccess: (results) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "payouts"] })
      for (const r of results) {
        void queryClient.invalidateQueries({
          queryKey: ["admin", "payouts", r.id],
        })
      }
    },
  })
}

const CP_PRESETS_KEY = ["admin", "cp-presets"] as const

export function useAdminCpPresets() {
  return useQuery({
    queryKey: CP_PRESETS_KEY,
    queryFn: fetchAdminCpPresets,
  })
}

function invalidateCpPresets(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: CP_PRESETS_KEY })
}

export function useCreateAdminCpPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: EconomyPresetInput) => createAdminCpPreset(payload),
    onSuccess: () => invalidateCpPresets(queryClient),
  })
}

export function useUpdateAdminCpPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EconomyPresetInput }) =>
      updateAdminCpPreset(id, body),
    onSuccess: () => invalidateCpPresets(queryClient),
  })
}

export function useDeleteAdminCpPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAdminCpPreset(id),
    onSuccess: () => invalidateCpPresets(queryClient),
  })
}

export function useDuplicateAdminCpPreset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label?: string }) =>
      duplicateAdminCpPreset(id, label),
    onSuccess: () => invalidateCpPresets(queryClient),
  })
}

export function useRestoreDefaultAdminCpPresets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => restoreDefaultAdminCpPresets(),
    onSuccess: () => invalidateCpPresets(queryClient),
  })
}
