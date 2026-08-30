import { QueryClient } from "@tanstack/react-query"

const shouldRetry = (failureCount: number, error: unknown) => {
  const statusCode = (error as { statusCode?: number } | undefined)?.statusCode
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return false
  }
  return failureCount < 3
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      throwOnError: false,
      retry: shouldRetry,
    },
    // Login/register/etc. must not auto-retry — especially on mis-mapped 5xx.
    mutations: {
      throwOnError: false,
      retry: false,
    },
  },
})