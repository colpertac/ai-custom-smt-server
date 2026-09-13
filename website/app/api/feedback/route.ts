import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FeedbackImageValidationError,
  createFeedback,
} from "@/lib/feedback-store"
import { requireWebSession } from "@/lib/web-session"
import { feedbackSchema } from "@/features/feedback/schemas/feedback.schema"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("feedback-create", 5, 60_000)
  if (blocked) return blocked

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiFail("Expected multipart form data", 400, "VALIDATION")
  }

  const parsed = feedbackSchema.safeParse({
    category: form.get("category"),
    body: form.get("body"),
  })
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const file = form.get("file")
  let imageBytes: Buffer | undefined
  if (file instanceof File && file.size > 0) {
    if (file.size > FEEDBACK_IMAGE_MAX_BYTES) {
      return apiFail("File too large (max 5 MiB)", 413, "PAYLOAD")
    }
    try {
      imageBytes = Buffer.from(await file.arrayBuffer())
    } catch {
      return apiFail("Failed to read upload", 400, "VALIDATION")
    }
  }

  const session = await requireWebSession()
  const username = session?.username?.trim() || null

  try {
    const item = createFeedback({
      username,
      category: parsed.data.category,
      body: parsed.data.body,
      imageBytes,
    })
    return apiOk({ id: item.id }, "Thanks")
  } catch (error) {
    if (error instanceof FeedbackImageValidationError) {
      return apiFail(error.message, 400, "VALIDATION")
    }
    return apiFail(
      error instanceof Error ? error.message : "Submit failed",
      500,
      "FEEDBACK"
    )
  }
}
