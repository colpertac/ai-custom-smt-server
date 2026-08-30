import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import {
  assertConfigId,
  ConfigValidationError,
  loadConfigDocument,
  saveConfigDocument,
} from "@/lib/server-config/fs"
import { persistWebSession, requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const { id: raw } = await ctx.params
    const id = assertConfigId(raw)
    const loaded = await loadConfigDocument(id)
    await persistWebSession(session)
    return apiOk({
      id,
      document: loaded.document,
      fields: loaded.fields ?? null,
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to load config",
      500,
      "CONFIG"
    )
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("admin-config-save", 30, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  try {
    const { id: raw } = await ctx.params
    const id = assertConfigId(raw)
    const result = await saveConfigDocument(id, body)
    await persistWebSession(session)
    return apiOk(
      { id, warnings: result.warnings },
      result.warnings.length
        ? `Saved with ${result.warnings.length} warning(s)`
        : "Saved"
    )
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return Response.json(
        {
          success: false,
          message: error.message,
          error: "VALIDATION",
          statusCode: 400,
          data: { issues: error.issues },
        },
        { status: 400 }
      )
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to save config",
      400,
      "CONFIG"
    )
  }
}
