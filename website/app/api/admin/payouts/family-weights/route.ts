import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { putFamilyWeightsSchema } from "@/lib/dungeon-payout-schema"
import {
  readFamilyWeights,
  writeFamilyWeights,
} from "@/lib/family-weights-fs"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const file = await readFamilyWeights()
    return apiOk(file)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to read family weights",
      500,
      "PAYOUTS"
    )
  }
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation(
    "admin-payouts-family-weights",
    60,
    60_000
  )
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

  const parsed = putFamilyWeightsSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    await writeFamilyWeights(parsed.data)
    return apiOk(parsed.data, "Saved family weights")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to save family weights",
      500,
      "PAYOUTS"
    )
  }
}
