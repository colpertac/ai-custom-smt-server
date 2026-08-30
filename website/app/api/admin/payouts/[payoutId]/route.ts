import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { putPayoutSchema } from "@/lib/dungeon-payout-schema"
import {
  deletePayout,
  PayoutNotFoundError,
  readPayout,
  writePayout,
} from "@/lib/dungeon-payouts-fs"
import { requireWebSession } from "@/lib/web-session"

type Params = { params: Promise<{ payoutId: string }> }

async function requireAdminSession() {
  const session = await requireWebSession()
  if (!session) {
    return { error: apiFail("Unauthorized", 401, "UNAUTHORIZED") as Response }
  }
  if (!isAdminLevel(session.userLevel)) {
    return { error: apiFail("Forbidden", 403, "FORBIDDEN") as Response }
  }
  return { session }
}

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdminSession()
  if ("error" in auth) return auth.error

  const { payoutId } = await params
  try {
    const file = await readPayout(payoutId)
    return apiOk(file)
  } catch (error) {
    if (error instanceof PayoutNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to load payout",
      500,
      "PAYOUTS"
    )
  }
}

export async function PUT(request: Request, { params }: Params) {
  const blocked = await guardApiMutation("admin-payouts-put", 60, 60_000)
  if (blocked) return blocked

  const auth = await requireAdminSession()
  if ("error" in auth) return auth.error

  const { payoutId } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = putPayoutSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }
  if (parsed.data.payout.id !== payoutId) {
    return apiFail("payout id mismatch with URL", 400, "VALIDATION")
  }

  try {
    await readPayout(payoutId)
    await writePayout(parsed.data)
    return apiOk({ id: payoutId })
  } catch (error) {
    if (error instanceof PayoutNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to save payout",
      500,
      "PAYOUTS"
    )
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const blocked = await guardApiMutation("admin-payouts-delete", 30, 60_000)
  if (blocked) return blocked

  const auth = await requireAdminSession()
  if ("error" in auth) return auth.error

  const { payoutId } = await params
  try {
    await deletePayout(payoutId)
    return apiOk({ id: payoutId })
  } catch (error) {
    if (error instanceof PayoutNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to delete payout",
      500,
      "PAYOUTS"
    )
  }
}
