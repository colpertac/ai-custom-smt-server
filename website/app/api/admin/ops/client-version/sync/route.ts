import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { syncClientVersionToHigher } from "@/lib/client-version"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const maxDuration = 180

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-ops-client-version-sync",
    8,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let hintCode: number | undefined
  let xml: string | undefined
  try {
    const body = (await request.json()) as { hintCode?: unknown; xml?: unknown }
    if (typeof body.hintCode === "number" && Number.isInteger(body.hintCode)) {
      hintCode = body.hintCode
    } else if (typeof body.hintCode === "string" && body.hintCode.trim()) {
      const n = Number(body.hintCode.trim())
      if (Number.isInteger(n)) hintCode = n
    }
    if (typeof body.xml === "string") xml = body.xml
  } catch {
    /* empty body is fine */
  }

  try {
    const result = await syncClientVersionToHigher(session.username, {
      hintCode,
      xml,
    })
    return apiOk(result, result.message)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Client version sync failed"
    const status = /valid XML|Root element|hintCode|too large|positive integer/i.test(
      message
    )
      ? 400
      : 502
    return apiFail(message, status, "CLIENT_VERSION")
  }
}
