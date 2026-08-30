import JSZip from "jszip"

import { apiFail } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  buildPayoutPackageFiles,
  listPayouts,
  readPayout,
} from "@/lib/dungeon-payouts-fs"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const items = await listPayouts()
    if (!items.length) {
      return apiFail("No payouts in working copy", 404, "NOT_FOUND")
    }

    const zip = new JSZip()
    for (const item of items) {
      const file = await readPayout(item.id)
      for (const part of buildPayoutPackageFiles(file.payout)) {
        zip.file(part.path, part.content)
      }
    }

    const buf = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    })

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition":
          'attachment; filename="ai_custom_payouts_all.zip"',
      },
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to export payouts",
      500,
      "PAYOUTS"
    )
  }
}
