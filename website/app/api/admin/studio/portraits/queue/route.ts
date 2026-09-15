import { z } from "zod"

import {
  adminEnqueuePortraitCharacter,
  summarizePortraitQueue,
} from "@/lib/admin-portrait-queue"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { requireWebSession } from "@/lib/web-session"

const enqueueSchema = z.object({
  name: z.string().trim().min(1).max(32),
  force: z.boolean().optional(),
})

/** List portrait queue jobs + status counts for Admin Studio. */
export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const summary = summarizePortraitQueue()
    return apiOk({
      counts: summary.counts,
      jobs: summary.jobs.map((j) => ({
        fingerprint: j.fingerprint,
        characterName: j.characterName,
        status: j.status,
        error: j.error,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        claimedAt: j.claimedAt,
      })),
    })
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Queue list failed",
      502,
      "PORTRAIT_QUEUE"
    )
  }
}

/** Enqueue one character for portrait capture. */
export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-studio-portraits-enqueue",
    40,
    60_000
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
  const parsed = enqueueSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    const result = adminEnqueuePortraitCharacter(parsed.data.name, {
      force: Boolean(parsed.data.force),
    })
    if (result.action === "not_found") {
      return apiFail(
        result.reason || `Character not found: ${parsed.data.name}`,
        404,
        "NOT_FOUND"
      )
    }
    if (result.action === "hidden") {
      return apiFail(
        result.reason || "Cannot enqueue studio mannequins",
        400,
        "HIDDEN"
      )
    }
    const summary = summarizePortraitQueue()
    return apiOk(
      { result, counts: summary.counts },
      result.action === "skipped"
        ? `Skipped ${result.name}: ${result.reason}`
        : result.action === "forced"
          ? `Force-queued ${result.name}`
          : `Queued ${result.name}`
    )
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Enqueue failed",
      502,
      "PORTRAIT_QUEUE"
    )
  }
}
