import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import {
  importWorkingShopFromXml,
  ShopImportValidationError,
  type ImportWorkingShopResult,
} from "@/lib/comp-shops-fs"
import { requireWebSession } from "@/lib/web-session"

const MAX_XML_BYTES = 5 * 1024 * 1024
const MAX_FILES = 50

type ImportError = { filename: string; message: string }

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

  const files = form.getAll("file").filter((entry): entry is File => entry instanceof File)
  if (files.length === 0) {
    return apiFail("Missing file", 400, "VALIDATION")
  }
  if (files.length > MAX_FILES) {
    return apiFail(`Too many files (max ${MAX_FILES})`, 400, "VALIDATION")
  }

  const imported: ImportWorkingShopResult[] = []
  const errors: ImportError[] = []

  // Sequential so ShopID reassignment sees shops from earlier files in the batch.
  for (const file of files) {
    const filename = file.name.trim() || "upload.xml"
    if (file.size <= 0) {
      errors.push({ filename, message: "Empty file" })
      continue
    }
    if (file.size > MAX_XML_BYTES) {
      errors.push({ filename, message: "File too large (max 5 MiB)" })
      continue
    }
    if (!/\.xml$/i.test(filename)) {
      errors.push({ filename, message: "File must be a .xml shop export" })
      continue
    }

    let xml: string
    try {
      xml = await file.text()
    } catch {
      errors.push({ filename, message: "Failed to read upload" })
      continue
    }

    try {
      imported.push(await importWorkingShopFromXml(xml, filename))
    } catch (error) {
      const message =
        error instanceof ShopImportValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Import failed"
      errors.push({ filename, message })
    }
  }

  if (imported.length === 0) {
    const first = errors[0]
    return apiFail(
      first?.message ?? "Import failed",
      first?.message?.includes("too large") ? 413 : 400,
      first?.message?.includes("too large") ? "PAYLOAD" : "VALIDATION"
    )
  }

  const message =
    errors.length === 0
      ? imported.length === 1
        ? "Imported"
        : `Imported ${imported.length} shops`
      : `Imported ${imported.length} of ${files.length} shops`

  return apiOk({ imported, errors }, message, { status: 201 })
}
