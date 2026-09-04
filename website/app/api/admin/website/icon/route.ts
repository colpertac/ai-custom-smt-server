import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  BRANDING_ICON_MAX_BYTES,
  BrandingIconValidationError,
  clearWebsiteBrandingIcon,
  setWebsiteBrandingIcon,
} from "@/lib/site-settings-store"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-website-icon", 20, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiFail("Expected multipart form data", 400, "VALIDATION")
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return apiFail("Missing file", 400, "VALIDATION")
  }
  if (file.size <= 0) {
    return apiFail("Empty file", 400, "VALIDATION")
  }
  if (file.size > BRANDING_ICON_MAX_BYTES) {
    return apiFail("File too large (max 512 KiB)", 413, "PAYLOAD")
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(await file.arrayBuffer())
  } catch {
    return apiFail("Failed to read upload", 400, "VALIDATION")
  }

  try {
    const branding = setWebsiteBrandingIcon(bytes)
    return apiOk({ branding }, "Icon uploaded")
  } catch (error) {
    if (error instanceof BrandingIconValidationError) {
      return apiFail(error.message, 400, "VALIDATION")
    }
    return apiFail(
      error instanceof Error ? error.message : "Upload failed",
      500,
      "BRANDING"
    )
  }
}

export async function DELETE() {
  const blocked = await guardApiMutation("admin-website-icon-clear", 20, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const branding = clearWebsiteBrandingIcon()
  return apiOk({ branding }, "Icon reset")
}
