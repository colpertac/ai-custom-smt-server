export const FEEDBACK_CATEGORIES = [
  "translation",
  "crash",
  "lag",
  "other",
] as const

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  translation: "Translation / text",
  crash: "Crash / NPC",
  lag: "Lag / performance",
  other: "Other",
}

export const FEEDBACK_STATUSES = ["open", "closed"] as const

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const FEEDBACK_BODY_MAX = 4000

export type FeedbackItem = {
  id: number
  username: string | null
  category: FeedbackCategory
  body: string
  status: FeedbackStatus
  createdAt: number
  hasImage: boolean
  imageUrl: string | null
}
