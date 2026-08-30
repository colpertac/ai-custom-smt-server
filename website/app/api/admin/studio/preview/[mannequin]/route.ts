import fs from "node:fs"

import { apiFail } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  normalizePreviewMannequin,
  previewImagePath,
  readPreviewMeta,
} from "@/lib/studio-preview"
import { requireWebSession } from "@/lib/web-session"

type Params = { params: Promise<{ mannequin: string }> }

export async function GET(_request: Request, { params }: Params) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { mannequin: raw } = await params
  const mannequin = normalizePreviewMannequin(raw ?? "")
  if (!mannequin) {
    return apiFail("mannequin must be vam1 or vaf1", 400, "VALIDATION")
  }

  const imgPath = previewImagePath(mannequin)
  if (!fs.existsSync(imgPath)) {
    return apiFail(`No preview for ${mannequin} yet`, 404, "NOT_FOUND")
  }

  const buf = fs.readFileSync(imgPath)
  const meta = readPreviewMeta(mannequin)
  const headers = new Headers({
    "Content-Type": "image/png",
    "Cache-Control": "no-store",
  })
  if (meta?.iso) {
    headers.set("X-Preview-Iso", meta.iso)
  }
  return new Response(buf, { status: 200, headers })
}
