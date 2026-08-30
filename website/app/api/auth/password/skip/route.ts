import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  SKIP_DEFAULT_ADMIN_PASSWORD_PROMPT_KEY,
} from "@/lib/default-admin"
import { readSession, sealSession } from "@/lib/session"
import { setSiteSetting } from "@/lib/site-settings-store"

/** Dismiss default-admin password prompt (keep admin123 if desired). */
export async function POST() {
  const blocked = await guardApiMutation("password-skip", 5, 60_000)
  if (blocked) return blocked

  const session = await readSession()
  if (!session) {
    return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  }

  setSiteSetting(SKIP_DEFAULT_ADMIN_PASSWORD_PROMPT_KEY, "1")
  await sealSession({ ...session, mustChangePassword: false })

  return apiOk({ mustChangePassword: false }, "Password change skipped")
}
