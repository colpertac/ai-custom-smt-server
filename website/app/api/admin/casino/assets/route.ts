import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import {
  CASINO_SWF_MAX_BYTES,
  CasinoFlashError,
  guessCasinoGameFromFileName,
  listCasinoFlashAssets,
  writeCasinoSwf,
} from "@/lib/casino-flash-fs"
import { isWebGameId } from "@/lib/webgames-fs"
import { requireWebSession } from "@/lib/web-session"

async function requireAdmin() {
  const session = await requireWebSession()
  if (!session) {
    return { error: apiFail("Unauthorized", 401, "UNAUTHORIZED") as Response }
  }
  if (!isAdminLevel(session.userLevel)) {
    return { error: apiFail("Forbidden", 403, "FORBIDDEN") as Response }
  }
  return { session }
}

export async function GET() {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  try {
    return apiOk(await listCasinoFlashAssets())
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list casino assets",
      500,
      "CASINO_FLASH"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-casino-flash-upload", 20, 60_000)
  if (blocked) return blocked

  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

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
  if (file.size > CASINO_SWF_MAX_BYTES) {
    return apiFail("File too large (max 8 MiB)", 413, "PAYLOAD")
  }

  const gameField = String(form.get("game") || "").trim().toLowerCase()
  const game =
    (isWebGameId(gameField) ? gameField : null) ||
    guessCasinoGameFromFileName(file.name)
  if (!game) {
    return apiFail(
      "Choose Slots, Roulette, or Kino (or name the file Slots.swf / Roulette.swf / Kino.swf)",
      400,
      "VALIDATION"
    )
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(await file.arrayBuffer())
  } catch {
    return apiFail("Failed to read upload", 400, "VALIDATION")
  }

  try {
    const asset = await writeCasinoSwf(game, bytes)
    const status = await listCasinoFlashAssets()
    return apiOk(
      { asset, ...status },
      `${asset.label} game file uploaded`
    )
  } catch (error) {
    if (error instanceof CasinoFlashError) {
      return apiFail(error.message, 400, "VALIDATION")
    }
    return apiFail(
      error instanceof Error ? error.message : "Upload failed",
      500,
      "CASINO_FLASH"
    )
  }
}
