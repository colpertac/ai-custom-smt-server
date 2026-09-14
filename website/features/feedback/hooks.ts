"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { notifyOpenFeedbackPendingChanged } from "@/features/admin/open-feedback-pending"
import {
  fetchAdminFeedback,
  resolveAdminFeedback,
  submitFeedback,
} from "@/features/feedback/api"
import type { FeedbackStatus } from "@/lib/feedback-constants"

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: submitFeedback,
  })
}

export function useAdminFeedback(status: FeedbackStatus) {
  return useQuery({
    queryKey: ["admin-feedback", status],
    queryFn: () => fetchAdminFeedback(status),
  })
}

export function useResolveAdminFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: FeedbackStatus }) =>
      resolveAdminFeedback(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-feedback"] })
      notifyOpenFeedbackPendingChanged()
    },
  })
}
