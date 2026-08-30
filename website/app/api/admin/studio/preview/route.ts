import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  captureStudioPreview,
  PreviewError,
  previewImagePath,
  readPreviewMeta,
} from "@/lib/studio-preview"
import { requireWebSession } from "@/lib/web-session"
import fs from "node:fs"

export async function POST(request: Request) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: { mannequin?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return apiFail("Expected JSON body", 400, "VALIDATION")
  }

  const mannequin = body.mannequin?.trim() ?? ""
  if (!mannequin) {
    return apiFail("mannequin is required", 400, "VALIDATION")
  }

  try {
    const result = await captureStudioPreview(mannequin)
    return apiOk(
      {
        ...result,
        imagePath: `/api/admin/studio/preview/${result.mannequin}`,
      },
      `Preview captured for ${result.mannequin}`
    )
  } catch (error) {
    if (error instanceof PreviewError) {
      return apiFail(error.message, error.status, "PREVIEW")
    }
    return apiFail(
      error instanceof Error ? error.message : "Preview failed",
      502,
      "PREVIEW"
    )
  }
}

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const roles = ["vam1", "vaf1"] as const
  const previews = roles.map((mannequin) => {
    const meta = readPreviewMeta(mannequin)
    const imgPath = previewImagePath(mannequin)
    const hasImage = fs.existsSync(imgPath)
    return {
      mannequin,
      iso: meta?.iso ?? null,
      ts: meta?.ts ?? null,
      hasImage,
      imagePath: `/api/admin/studio/preview/${mannequin}`,
    }
  })
  return apiOk({ previews })
}
