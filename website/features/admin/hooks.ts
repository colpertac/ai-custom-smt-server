"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import {
  deleteAdminAccount,
  fetchAdminAccountCharacters,
  fetchAdminAccounts,
  fetchDemonReunionEditSettings,
  fetchExpertiseDigiEditSettings,
  updateAdminAccount,
  updateDemonReunionEditSettings,
  updateExpertiseDigiEditSettings,
} from "@/features/admin/api"

export function useAdminAccounts() {
  return useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: fetchAdminAccounts,
  })
}

export function useExpertiseDigiEditSettings() {
  return useQuery({
    queryKey: ["admin", "expertise-digi-edit"],
    queryFn: fetchExpertiseDigiEditSettings,
  })
}

export function useUpdateExpertiseDigiEditSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateExpertiseDigiEditSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "expertise-digi-edit"], data)
    },
  })
}

export function useDemonReunionEditSettings() {
  return useQuery({
    queryKey: ["admin", "demon-reunion-edit"],
    queryFn: fetchDemonReunionEditSettings,
  })
}

export function useUpdateDemonReunionEditSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateDemonReunionEditSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "demon-reunion-edit"], data)
    },
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
