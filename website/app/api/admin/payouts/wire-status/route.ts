import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { loadClearLootCatalog } from "@/lib/payout-clear-loot-catalog"
import { requireWebSession } from "@/lib/web-session"

/** Summary + per-payout wire status from clear-loot-catalog.json */
export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const catalog = await loadClearLootCatalog()
  if (!catalog) {
    return apiFail(
      "clear-loot-catalog.json missing — run scripts/payout-scan-clear-loot.py",
      404,
      "CATALOG_MISSING"
    )
  }

  return apiOk({
    generatedAt: catalog.generatedAt,
    summary: catalog.summary,
    wireStatus: catalog.wireStatus ?? [],
  })
}
