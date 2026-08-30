"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchStatus } from "@/features/status/api"

export function useServerStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: fetchStatus,
    refetchInterval: 30_000,
  })
}
