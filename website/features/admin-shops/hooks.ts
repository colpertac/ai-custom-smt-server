"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createAdminShop,
  deleteAdminShop,
  fetchAdminShop,
  fetchAdminShops,
  reorderAdminShops,
  saveAdminShop,
  uploadAdminShopXml,
  type ShopListItem,
} from "@/features/admin-shops/api"
import { applyShopSlotRemapToList } from "@/lib/comp-shop-order"
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

export function useReorderAdminShops() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (shopIds: number[]) => reorderAdminShops(shopIds),
    onMutate: async (contentOrderIds) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "shops"] })
      const previous = queryClient.getQueryData<ShopListItem[]>([
        "admin",
        "shops",
      ])
      if (previous?.length) {
        try {
          const next = applyShopSlotRemapToList(previous, contentOrderIds)
          queryClient.setQueryData<ShopListItem[]>(["admin", "shops"], next)
        } catch {
          /* keep previous until server responds */
        }
      }
      return { previous }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["admin", "shops"], ctx.previous)
      }
    },
    onSuccess: (shops) => {
      queryClient.setQueryData(["admin", "shops"], shops)
      void queryClient.invalidateQueries({
        queryKey: ["admin", "shops"],
        exact: false,
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "shops"] })
    },
  })
}

export function useUploadAdminShop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (files: File | File[]) => uploadAdminShopXml(files),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "shops"] })
      for (const shop of data.imported) {
        void queryClient.invalidateQueries({
          queryKey: ["admin", "shops", shop.shopId],
        })
      }
    },
  })
}
