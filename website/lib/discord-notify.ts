/**
 * Discord notification helpers for Admin → Notifications toggles.
 */
import { getSiteUrl } from "@/lib/env"
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackItem,
} from "@/lib/feedback-constants"
import type { AdminReport } from "@/lib/comp-api"
import {
  sendDiscordWebhook,
  type DiscordEmbed,
  type DiscordWebhookPayload,
} from "@/lib/server-watchdog"
import {
  getNotificationSettings,
  type NotificationSettings,
} from "@/lib/site-settings-store"

export type NotifyKind =
  | "services"
  | "feedback"
  | "reports"

function toggleForKind(
  settings: NotificationSettings,
  kind: NotifyKind
): boolean {
  switch (kind) {
    case "services":
      return settings.notifyServicesDown
    case "feedback":
      return settings.notifyFeedback
    case "reports":
      return settings.notifyReports
  }
}

function adminPathUrl(path: string): string | undefined {
  const origin = getSiteUrl()?.replace(/\/$/, "")
  if (!origin) return undefined
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/**
 * Send a Discord payload when webhook is set and the matching toggle is on.
 * Returns skipped/ok/error — callers should not fail user requests on Discord errors.
 */
export async function notifyIfEnabled(
  kind: NotifyKind,
  payload: DiscordWebhookPayload | (() => DiscordWebhookPayload)
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const settings = getNotificationSettings()
  const webhook = settings.discordWebhook.trim()
  if (!webhook) {
    return { ok: false, skipped: true, error: "No Discord webhook configured" }
  }
  if (!toggleForKind(settings, kind)) {
    return { ok: false, skipped: true, error: `Notifications disabled for ${kind}` }
  }
  const body = typeof payload === "function" ? payload() : payload
  return sendDiscordWebhook(webhook, body)
}

export function buildFeedbackNotifyEmbed(item: FeedbackItem): DiscordEmbed {
  const label =
    FEEDBACK_CATEGORY_LABELS[item.category] ?? item.category
  const url = adminPathUrl("/admin/feedback")
  return {
    title: "New website feedback",
    description: truncate(item.body, 400),
    url,
    color: 0x3498db,
    fields: [
      { name: "Category", value: label, inline: true },
      {
        name: "From",
        value: item.username?.trim() || "(anonymous)",
        inline: true,
      },
      {
        name: "Id",
        value: String(item.id),
        inline: true,
      },
      ...(item.images.length > 0
        ? [
            {
              name: "Screenshots",
              value: String(item.images.length),
              inline: true,
            },
          ]
        : []),
    ],
    footer: { text: "SMT Notifications • feedback" },
    timestamp: new Date(item.createdAt).toISOString(),
  }
}

export async function notifyNewFeedback(
  item: FeedbackItem
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  return notifyIfEnabled("feedback", {
    embeds: [buildFeedbackNotifyEmbed(item)],
  })
}

export function buildReportNotifyEmbed(report: AdminReport): DiscordEmbed {
  const url = adminPathUrl("/admin/reports")
  const comment = report.comment?.trim() || "(no comment)"
  return {
    title: "New player report",
    description: truncate(comment, 400),
    url,
    color: 0xe67e22,
    fields: [
      {
        name: "Reported",
        value: report.playerName?.trim() || "(unknown)",
        inline: true,
      },
      {
        name: "Reporter",
        value: report.reporterUsername?.trim() || "(unknown)",
        inline: true,
      },
      ...(report.location?.trim()
        ? [{ name: "Location", value: truncate(report.location, 80), inline: true }]
        : []),
      {
        name: "Uid",
        value: report.uid || "(none)",
        inline: true,
      },
    ],
    footer: { text: "SMT Notifications • reports" },
    timestamp: report.reportTime
      ? new Date(report.reportTime * 1000).toISOString()
      : new Date().toISOString(),
  }
}

export async function notifyNewReport(
  report: AdminReport
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  return notifyIfEnabled("reports", {
    embeds: [buildReportNotifyEmbed(report)],
  })
}
