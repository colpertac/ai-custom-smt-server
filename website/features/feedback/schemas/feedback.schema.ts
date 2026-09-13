import { z } from "zod"

import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_CATEGORIES,
} from "@/lib/feedback-constants"

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  body: z
    .string()
    .trim()
    .min(1, "Write something so we can follow along")
    .max(FEEDBACK_BODY_MAX, `Keep it under ${FEEDBACK_BODY_MAX} characters`),
})

export type FeedbackInput = z.infer<typeof feedbackSchema>
