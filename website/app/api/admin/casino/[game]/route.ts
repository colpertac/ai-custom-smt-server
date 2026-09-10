import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import {
  isWebGameId,
  readWebGameFile,
  updateWebGameSettings,
  WebGameConfigError,
} from "@/lib/webgames-fs"
import { webGameSettingsBodySchema } from "@/lib/webgames-schema"
import { requireWebSession } from "@/lib/web-session"

type RouteContext = { params: Promise<{ game: string }> }

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

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { game } = await context.params
  if (!isWebGameId(game)) {
    return apiFail("Unknown casino game", 404, "NOT_FOUND")
  }

  try {
    return apiOk(await readWebGameFile(game))
  } catch (error) {
    const status = error instanceof WebGameConfigError ? 404 : 500
    return apiFail(
      error instanceof Error ? error.message : "Failed to load casino game",
      status,
      "CASINO_WEBGAMES"
    )
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const blocked = await guardApiMutation("admin-casino-webgames", 60, 60_000)
  if (blocked) return blocked

  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { game } = await context.params
  if (!isWebGameId(game)) {
    return apiFail("Unknown casino game", 404, "NOT_FOUND")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = webGameSettingsBodySchema.safeParse({
    ...(typeof body === "object" && body ? body : {}),
    game,
  })
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    const file = await updateWebGameSettings(
      parsed.data.game,
      parsed.data.settings
    )
    return apiOk(
      file,
      `Saved ${parsed.data.game} settings — restart lobby to apply`
    )
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to save casino game",
      500,
      "CASINO_WEBGAMES"
    )
  }
}
