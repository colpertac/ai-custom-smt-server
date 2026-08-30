import { changeDisplayName } from "@/lib/comp-api"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { persistWebSession, requireWebSession } from "@/lib/web-session"
import { z } from "zod"

const schema = z.object({
  dispName: z.string().trim().min(1, "Account name required").max(32),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("disp-name", 10, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = await changeDisplayName(session, parsed.data.dispName)
    if (result.error !== "Success") {
      return apiFail(result.error, 400, "UPDATE")
    }
    session.dispName = parsed.data.dispName
    await persistWebSession(session)
    return apiOk({ dispName: parsed.data.dispName })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Update failed",
      502,
      "COMP"
    )
  }
}
