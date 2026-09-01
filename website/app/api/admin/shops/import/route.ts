import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import {
  importWorkingShopFromXml,
  ShopImportValidationError,
} from "@/lib/comp-shops-fs"
import { requireWebSession } from "@/lib/web-session"

const MAX_XML_BYTES = 5 * 1024 * 1024

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-shops-import", 20, 60_000)
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
  if (file.size > MAX_XML_BYTES) {
    return apiFail("File too large (max 5 MiB)", 413, "PAYLOAD")
  }

  const name = file.name.trim()
  if (!/\.xml$/i.test(name)) {
    return apiFail("File must be a .xml shop export", 400, "VALIDATION")
  }

  let xml: string
  try {
    xml = await file.text()
  } catch {
    return apiFail("Failed to read upload", 400, "VALIDATION")
  }

  try {
    const result = await importWorkingShopFromXml(xml, name)
    return apiOk(result, "Imported", { status: 201 })
  } catch (error) {
    if (error instanceof ShopImportValidationError) {
      return apiFail(error.message, 400, "VALIDATION")
    }
    return apiFail(
      error instanceof Error ? error.message : "Import failed",
      400,
      "SHOPS"
    )
  }
}
