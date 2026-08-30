"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import {
  deleteAdminAccount,
  fetchAdminAccountCharacters,
  fetchAdminAccounts,
  updateAdminAccount,
} from "@/features/admin/api"

export function useAdminAccounts() {
  return useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: fetchAdminAccounts,
  })
}

export function useAdminAccountCharacters(username: string | null) {
  return useQuery({
    queryKey: ["admin", "accounts", username, "characters"],
    queryFn: () => fetchAdminAccountCharacters(username!),
    enabled: Boolean(username),
  })
}

export function useUpdateAdminAccount() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: ({
      username,
      payload,
    }: {
      username: string
      payload: Record<string, unknown>
    }) => updateAdminAccount(username, payload),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "accounts"] })
      if (data.selfUpdated) {
        void queryClient.invalidateQueries({ queryKey: ["session"] })
        router.push("/login")
      }
    },
  })
}

export function useDeleteAdminAccount() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (username: string) => deleteAdminAccount(username),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "accounts"] })
      if (data.selfDeleted) {
        void queryClient.invalidateQueries({ queryKey: ["session"] })
        router.push("/")
      }
    },
  })
}
