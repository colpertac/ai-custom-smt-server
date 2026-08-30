import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { createPayoutSchema } from "@/lib/dungeon-payout-schema"
import {
  createPayout,
  emptyPayout,
  listPayouts,
  PayoutConflictError,
} from "@/lib/dungeon-payouts-fs"
import { PAYOUT_SCHEMA_VERSION } from "@/lib/dungeon-payout-types"
import { persistWebSession, requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const payouts = await listPayouts()
    await persistWebSession(session)
    return apiOk(payouts)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list payouts",
      500,
      "PAYOUTS"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-payouts-create", 30, 60_000)
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

  const parsed = createPayoutSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  const payout = emptyPayout(
    parsed.data.id,
    parsed.data.name,
    parsed.data.instanceId
  )

  try {
    await createPayout(payout)
    await persistWebSession(session)
    return apiOk(
      { id: payout.id, version: PAYOUT_SCHEMA_VERSION },
      "Created",
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof PayoutConflictError) {
      return apiFail(error.message, 409, "CONFLICT")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to create payout",
      500,
      "PAYOUTS"
    )
  }
}
