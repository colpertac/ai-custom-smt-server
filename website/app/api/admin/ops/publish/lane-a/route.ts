import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { publishOpsLaneA } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-ops-publish-lane-a", 3, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let restart = true
  try {
    const body = (await request.json()) as { restart?: boolean }
    if (body.restart === false) restart = false
  } catch {
    /* default restart=true */
  }

  try {
    const result = await publishOpsLaneA(session.username, { restart })
    if (!result.ok) {
      const msg =
        result.error === "not_allowed"
          ? "Ops sidecar does not know POST /publish/lane-a. Stop it (Ctrl+C) and run pnpm run ops-sidecar again."
          : result.detail ||
            result.error ||
            (result.restartError
              ? "Published but channel restart failed"
              : "Lane A publish failed")
      return apiFail(msg, 502, "OPS")
    }
    const parts = [
      result.message || "Lane A published",
      result.shopsCopied != null ? `${result.shopsCopied} shop(s)` : null,
      result.payoutsPackaged != null
        ? `${result.payoutsPackaged} payout(s)`
        : null,
    ].filter(Boolean)
    return apiOk(result, parts.join(" — "))
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Lane A publish failed",
      502,
      "OPS"
    )
  }
}
