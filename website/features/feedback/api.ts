import type { FeedbackItem, FeedbackStatus } from "@/lib/feedback-constants"
import { fetcher } from "@/lib/fetcher"

export function submitFeedback(payload: FormData) {
  return fetcher<{ id: number }>("feedback", {
    method: "POST",
    body: payload,
  })
}

export function fetchAdminFeedback(status: FeedbackStatus) {
  return fetcher<{ items: FeedbackItem[] }>(
    `admin/feedback?status=${encodeURIComponent(status)}`
  )
}

export function resolveAdminFeedback(id: number, status: FeedbackStatus) {
  return fetcher<{ item: FeedbackItem }>("admin/feedback/resolve", {
    method: "POST",
    json: { id, status },
  })
}
