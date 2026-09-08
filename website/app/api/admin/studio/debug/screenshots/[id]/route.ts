import fs from "node:fs"

import { apiFail } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { resolveStudioDebugScreenshotPath } from "@/lib/studio-debug-screenshots"
import { requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { id } = await ctx.params
  const full = resolveStudioDebugScreenshotPath(id)
  if (!full) return apiFail("Not found", 404, "NOT_FOUND")

  const buf = fs.readFileSync(full)
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
    },
  })
}
