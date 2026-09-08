import { z } from "zod"

import { apiFail, apiOk } from "@/lib/api-response"
import { requirePortraitWorker } from "@/lib/portrait-worker-auth"
import { getServerAlertSettings } from "@/lib/site-settings-store"
import { sendDiscordWebhook } from "@/lib/server-watchdog"

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1800),
  role: z.string().max(32).optional(),
  screen: z.string().max(64).optional(),
  severity: z.enum(["info", "warning", "error"]).optional(),
})

/**
 * Wine-host portrait watchdog → Discord via Admin Watchdog webhook settings.
 */
export async function POST(request: Request) {
  const denied = requirePortraitWorker(request)
  if (denied) return denied

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

  const settings = getServerAlertSettings()
  const webhook = settings.discordWebhook.trim()
  if (!webhook) {
    return apiFail(
      "Discord webhook not configured (Admin → Watchdog / SERVER_ALERT_DISCORD_WEBHOOK)",
      400,
      "CONFIG"
    )
  }

  const severity = parsed.data.severity ?? "warning"
  const color =
    severity === "error" ? 0xe74c3c : severity === "info" ? 0x3498db : 0xf1c40f

  const sendRes = await sendDiscordWebhook(webhook, {
    embeds: [
      {
        title: parsed.data.title,
        description: parsed.data.message,
        color,
        fields: [
          ...(parsed.data.role
            ? [{ name: "Role", value: parsed.data.role, inline: true }]
            : []),
          ...(parsed.data.screen
            ? [{ name: "Screen", value: parsed.data.screen, inline: true }]
            : []),
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "portrait-watchdog" },
      },
    ],
  })

  if (!sendRes.ok) {
    return apiFail(sendRes.error || "Discord send failed", 502, "DISCORD")
  }
  return apiOk({ sent: true }, "Alert sent")
}
