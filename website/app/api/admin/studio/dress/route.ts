import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { dressStudioMannequin } from "@/lib/studio-api"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: {
    mannequin?: string
    source?: string
    pose?: boolean
    zone?: number
    x?: number
    y?: number
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return apiFail("Expected JSON body", 400, "VALIDATION")
  }

  const mannequin = body.mannequin?.trim() ?? ""
  const source = body.source?.trim() ?? ""
  if (!mannequin || !source) {
    return apiFail("mannequin and source are required", 400, "VALIDATION")
  }
  if (mannequin.length > 32 || source.length > 32) {
    return apiFail("Name too long", 400, "VALIDATION")
  }

  try {
    const result = await dressStudioMannequin({
      mannequin,
      source,
      pose: body.pose,
      zone: body.zone,
      x: body.x,
      y: body.y,
    })
    if (!result.ok) {
      return apiFail(result.error || "Dress failed", 409, "STUDIO")
    }
    return apiOk(result, `Dressed ${result.mannequin} as ${result.source}`)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Studio dress failed",
      502,
      "STUDIO"
    )
  }
}
