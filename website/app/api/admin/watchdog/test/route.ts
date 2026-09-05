import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { apiFail, apiOk } from "@/lib/api-response"
import { sendTestDiscordAlert } from "@/lib/server-watchdog"
import { requireWebSession } from "@/lib/web-session"

const testSchema = z.object({
  discordWebhook: z.string().optional(),
})

export async function POST(request: Request) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let webhook: string | undefined
  try {
    const body: unknown = await request.json().catch(() => ({}))
    const parsed = testSchema.safeParse(body)
    if (parsed.success && parsed.data.discordWebhook?.trim()) {
      webhook = parsed.data.discordWebhook.trim()
    }
  } catch {
    // optional body
  }

  const result = await sendTestDiscordAlert(webhook)
  if (!result.ok) {
    return apiFail(
      result.error || "Failed to send test alert to Discord",
      400,
      "DISCORD"
    )
  }

  return apiOk(null, "Test alert sent to Discord successfully!")
}
