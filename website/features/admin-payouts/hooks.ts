"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createAdminPayout,
  deleteAdminPayout,
  fetchAdminPayout,
  fetchAdminPayouts,
  saveAdminPayout,
} from "@/features/admin-payouts/api"
import type { DungeonPayoutFile } from "@/lib/dungeon-payout-types"

export function useAdminPayouts() {
  return useQuery({
    queryKey: ["admin", "payouts"],
    queryFn: fetchAdminPayouts,
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
