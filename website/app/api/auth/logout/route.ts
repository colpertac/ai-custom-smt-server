import { guardApiMutation } from "@/lib/api-guard"
import { apiOk } from "@/lib/api-response"
import { clearSession } from "@/lib/session"

export async function POST() {
  const blocked = await guardApiMutation("logout", 30, 60_000)
  if (blocked) return blocked

  await clearSession()
  return apiOk(null, "Logged out")
}
