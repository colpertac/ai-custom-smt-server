import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import {
  getClientVersionStatus,
  readCompClientXml,
  saveCompClientXml,
} from "@/lib/client-version"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const maxDuration = 180

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const [file, status] = await Promise.all([
      readCompClientXml(),
      getClientVersionStatus(),
    ])
    return apiOk(
      {
        ...status,
        xml: file.xml,
        exists: file.exists,
      },
      "OK",
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return apiFail(
      error instanceof Error
        ? error.message
        : "Failed to read comp_client.xml",
      500,
      "COMP_CLIENT"
    )
  }
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-ops-comp-client-save", 8, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let xml = ""
  try {
    const body = (await request.json()) as { xml?: string }
    xml = typeof body.xml === "string" ? body.xml : ""
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  try {
    const result = await saveCompClientXml(xml, session.username)
    return apiOk(result, result.message)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to save comp_client.xml",
      error instanceof Error && /valid XML|Root element|Missing <version>|too large|Paste your/i.test(
        error.message
      )
        ? 400
        : 502,
      "COMP_CLIENT"
    )
  }
}
