"use client"

import { useRef } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

import { ConfirmProvider } from "@/components/confirm-dialog"
import { ThemeProvider } from "@/components/theme-provider"
import type { SessionUser } from "@/features/auth/types/session"
import { queryClient } from "@/lib/queryClient"

export function Providers({
  children,
  initialSession,
}: {
  children: React.ReactNode
  initialSession: SessionUser | null
}) {
  const seeded = useRef(false)
  if (!seeded.current) {
    queryClient.setQueryData(["session"], initialSession)
    seeded.current = true
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfirmProvider>
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </ConfirmProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
