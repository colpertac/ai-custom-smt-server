import { adminDeletePromo, isDeletePromoSuccess } from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"

type Params = { params: Promise<{ code: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const blocked = await guardApiMutation("admin-promos-delete", 20, 60_000)
  if (blocked) return blocked

  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { code: raw } = await params
  const code = decodeURIComponent(raw).trim()
  if (!code) {
    return apiFail("Invalid promo code", 400, "VALIDATION")
  }

  try {
    return await withCompSession(async (session) => {
      const result = await adminDeletePromo(session, code)
      if (!isDeletePromoSuccess(result.error)) {
        return apiFail(result.error, 400, "DELETE_PROMO")
      }
      return apiOk({ code, message: result.error }, result.error)
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      error instanceof Error ? error.message : "Delete promo failed",
      502,
      "COMP"
    )
  }
}
