import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  assertImportPayloadSize,
  BackupParseError,
  buildCharacterImportPreview,
} from "@/lib/character-import/service"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("char-import-preview", 10, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiFail("Expected multipart form data", 400, "VALIDATION")
  }

  const file = form.get("backupXml")
  if (!(file instanceof File)) {
    return apiFail("Missing backupXml file", 400, "VALIDATION")
  }

  try {
    assertImportPayloadSize(file.size)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid file"
    const code = msg.includes("large") ? "PAYLOAD" : "VALIDATION"
    return apiFail(msg, code === "PAYLOAD" ? 413 : 400, code)
  }

  const name = file.name || "backup.xml"
  if (!/\.xml$/i.test(name) && file.type && !file.type.includes("xml")) {
    return apiFail("File must be a .xml Backups dump", 400, "VALIDATION")
  }

  try {
    const xml = await file.text()
    const preview = await buildCharacterImportPreview({
      username: session.username,
      xml,
      filename: name,
    })
    return apiOk(preview)
  } catch (err) {
    if (err instanceof BackupParseError) {
      return apiFail(err.message, 400, "PARSE")
    }
    return apiFail(
      err instanceof Error ? err.message : "Preview failed",
      400,
      "PREVIEW"
    )
  }
}
