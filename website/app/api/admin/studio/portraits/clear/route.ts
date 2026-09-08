import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { loadArmoryProfile } from "@/lib/armory"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { clearPortraitForCharacter } from "@/lib/portrait-queue"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  name: z.string().trim().min(1).max(32),
})

/**
 * Delete a character's cached portrait (+ queue row) so the next armory visit
 * shows the placeholder and re-enqueues capture.
 */
export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-studio-portraits-clear",
    30,
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
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const name = parsed.data.name
  const profile = loadArmoryProfile(name, { enqueuePortrait: false })
  const extra = profile?.portraitFingerprint
    ? [profile.portraitFingerprint]
    : []

  try {
    const result = clearPortraitForCharacter(name, {
      extraFingerprints: extra,
    })
    const armoryPath = `/armory/${encodeURIComponent(profile?.name ?? name)}`
    return apiOk(
      {
        ...result,
        characterExists: Boolean(profile),
        armoryPath,
      },
      profile
        ? `Cleared portrait for ${profile.name} — open ${armoryPath} to recapture`
        : `Cleared portrait files/jobs for ${name} (character not in world DB)`
    )
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Clear failed",
      502,
      "PORTRAIT_CLEAR"
    )
  }
}
