import { importAccountXml } from "@/lib/comp-import"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
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

  const file = form.get("accountToImport")
  if (!(file instanceof File)) {
    return apiFail("Missing accountToImport file", 400, "VALIDATION")
  }
  if (file.size <= 0) {
    return apiFail("Empty file", 400, "VALIDATION")
  }
  // Lobby ImportMaxPayload default 5120 KiB
  if (file.size > 5120 * 1024) {
    return apiFail("File too large (max ~5 MiB)", 413, "PAYLOAD")
  }

  try {
    const result = await importAccountXml(file, file.name)
    if (!result.ok) {
      return apiFail(result.message, 400, "IMPORT")
    }
    return apiOk({ message: result.message }, result.message)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Import failed",
      502,
      "COMP"
    )
  }
}
