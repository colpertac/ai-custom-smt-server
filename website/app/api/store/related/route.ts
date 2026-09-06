import { apiFail, apiOk } from "@/lib/api-response"
import { findRelatedStoreItems } from "@/lib/store-related"
import { requireWebSession } from "@/lib/web-session"

export async function GET(request: Request) {
  const session = await requireWebSession()
  if (!session) {
    return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  }

  const idsParam = new URL(request.url).searchParams.get("ids") ?? ""
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  const unique = [...new Set(ids)].slice(0, 20)

  if (unique.length === 0) {
    return apiOk({ related: [] })
  }

  try {
    return apiOk({ related: findRelatedStoreItems(unique, 6) })
  } catch (err) {
    return apiFail(
      err instanceof Error ? err.message : "Related lookup failed",
      500,
      "RELATED_ERROR"
    )
  }
}
