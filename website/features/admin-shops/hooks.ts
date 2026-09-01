"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createAdminShop,
  deleteAdminShop,
  fetchAdminShop,
  fetchAdminShops,
  saveAdminShop,
  uploadAdminShopXml,
} from "@/features/admin-shops/api"
import type { CompShop } from "@/lib/comp-shop-xml"

export function useAdminShops() {
  return useQuery({
    queryKey: ["admin", "shops"],
    queryFn: fetchAdminShops,
  })
}

export function useAdminShop(shopId: number | null) {
  return useQuery({
    queryKey: ["admin", "shops", shopId],
    queryFn: () => fetchAdminShop(shopId!),
    enabled: shopId != null,
  })
}

export function useCreateAdminShop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { shopId: number; name: string }) =>
      createAdminShop(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "shops"] })
    },
  })
}

export function useSaveAdminShop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ shopId, body }: { shopId: number; body: CompShop }) =>
      saveAdminShop(shopId, body),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "shops"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin", "shops", vars.shopId],
      })
    },
  })
}

export function useDeleteAdminShop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (shopId: number) => deleteAdminShop(shopId),
    onSuccess: (_data, shopId) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "shops"] })
      void queryClient.removeQueries({ queryKey: ["admin", "shops", shopId] })
    },
  })
}

export function useUploadAdminShop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadAdminShopXml(file),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "shops"] })
      void queryClient.invalidateQueries({
        queryKey: ["admin", "shops", data.shopId],
      })
    },
  })
}
