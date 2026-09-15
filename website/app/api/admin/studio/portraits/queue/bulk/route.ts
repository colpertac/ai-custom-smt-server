import { z } from "zod"

import {
  adminBulkEnqueuePortraits,
  summarizePortraitQueue,
} from "@/lib/admin-portrait-queue"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { requireWebSession } from "@/lib/web-session"

export const maxDuration = 120

const bodySchema = z.object({
  mode: z.enum(["missing", "force"]),
})

/**
 * Bulk enqueue portraits for all public characters (excludes vam/vaf).
 * - missing: only chars without a cached PNG
 * - force: clear + re-queue everyone
 */
export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-studio-portraits-bulk",
    5,
    120_000
  )
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
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    const bulk = adminBulkEnqueuePortraits(parsed.data.mode)
    const summary = summarizePortraitQueue()
    const queued = bulk.enqueued + bulk.forced
    return apiOk(
      {
        bulk: {
          mode: bulk.mode,
          scanned: bulk.scanned,
          enqueued: bulk.enqueued,
          forced: bulk.forced,
          skipped: bulk.skipped,
          hidden: bulk.hidden,
          notFound: bulk.notFound,
          // Trim per-row detail for large realms — keep skips with reasons.
          results: bulk.results.filter((r) => r.action !== "skipped").concat(
            bulk.results.filter((r) => r.action === "skipped").slice(0, 50)
          ),
        },
        counts: summary.counts,
      },
      parsed.data.mode === "force"
        ? `Force-queued ${queued} of ${bulk.scanned} characters (cleared existing portraits)`
        : `Queued ${queued} missing of ${bulk.scanned} characters (${bulk.skipped} skipped)`
    )
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Bulk enqueue failed",
      502,
      "PORTRAIT_BULK"
    )
  }
}
