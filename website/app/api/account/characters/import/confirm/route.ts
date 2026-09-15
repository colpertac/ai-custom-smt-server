import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { confirmCharacterImport } from "@/lib/character-import"
import { BackupParseError } from "@/lib/character-import/service"
import type { CharacterImportSelection } from "@/lib/character-import/types"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("char-import-confirm", 5, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Expected JSON body", 400, "VALIDATION")
  }

  const uploadToken =
    body &&
    typeof body === "object" &&
    typeof (body as { uploadToken?: unknown }).uploadToken === "string"
      ? (body as { uploadToken: string }).uploadToken.trim()
      : ""
  if (!uploadToken) {
    return apiFail("Missing uploadToken", 400, "VALIDATION")
  }

  const rawSelections =
    body &&
    typeof body === "object" &&
    Array.isArray((body as { selections?: unknown }).selections)
      ? (body as { selections: unknown[] }).selections
      : null
  if (!rawSelections?.length) {
    return apiFail("Select at least one character", 400, "VALIDATION")
  }

  const selections: CharacterImportSelection[] = []
  for (const row of rawSelections) {
    if (!row || typeof row !== "object") {
      return apiFail("Invalid selection entry", 400, "VALIDATION")
    }
    const sourceName = (row as { sourceName?: unknown }).sourceName
    const newName = (row as { newName?: unknown }).newName
    if (typeof sourceName !== "string" || typeof newName !== "string") {
      return apiFail("Each selection needs sourceName and newName", 400, "VALIDATION")
    }
    selections.push({
      sourceName: sourceName.trim(),
      newName: newName.trim(),
    })
  }

  try {
    const result = await confirmCharacterImport({
      username: session.username,
      uploadToken,
      selections,
    })
    return apiOk(result, "Characters imported")
  } catch (err) {
    if (err instanceof BackupParseError) {
      return apiFail(err.message, 400, "PARSE")
    }
    return apiFail(
      err instanceof Error ? err.message : "Import failed",
      400,
      "IMPORT"
    )
  }
}
