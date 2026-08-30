import JSZip from "jszip"

import { apiFail } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  buildPayoutPackageFiles,
  PayoutNotFoundError,
  readPayout,
} from "@/lib/dungeon-payouts-fs"
import { persistWebSession, requireWebSession } from "@/lib/web-session"

type Params = { params: Promise<{ payoutId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { payoutId } = await params
  try {
    const file = await readPayout(payoutId)

    const zip = new JSZip()
    for (const part of buildPayoutPackageFiles(file.payout)) {
      zip.file(part.path, part.content)
    }
    const buf = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    })
    await persistWebSession(session)

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="ai_custom_payout_${payoutId}.zip"`,
      },
    })
  } catch (error) {
    if (error instanceof PayoutNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to export payout",
      500,
      "PAYOUTS"
    )
  }
}
