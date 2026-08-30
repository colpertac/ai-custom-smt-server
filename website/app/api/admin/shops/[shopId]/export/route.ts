import { readFile } from "node:fs/promises"

import { apiFail } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  shopFilename,
  shopPath,
  ShopNotFoundError,
} from "@/lib/comp-shops-fs"
import { requireWebSession } from "@/lib/web-session"

type Params = { params: Promise<{ shopId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const shopId = Number.parseInt((await params).shopId, 10)
  if (!Number.isInteger(shopId) || shopId <= 0) {
    return apiFail("Invalid shop id", 400, "VALIDATION")
  }

  const filename = shopFilename(shopId)
  try {
    const xml = await readFile(shopPath(shopId), "utf8")
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return apiFail(new ShopNotFoundError(shopId).message, 404, "NOT_FOUND")
  }
}
