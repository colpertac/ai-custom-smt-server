import {
  getChannelProbePort,
  getLobbyProbePort,
  getWorldProbePort,
} from "@/lib/env"
import {
  getOpsMetrics,
  getOpsServiceLogs,
  type OpsProcessMetric,
} from "@/lib/ops-sidecar"
import { isServiceInMaintenance } from "@/lib/planned-maintenance"
import {
  getServerAlertSettings,
  getSiteSetting,
  setSiteSetting,
} from "@/lib/site-settings-store"
import { collectStatus, type ServiceStatus } from "@/lib/status"

export type DiscordEmbedField = {
  name: string
  value: string
  inline?: boolean
}

export type DiscordEmbed = {
  title: string
  description?: string
  url?: string
  color?: number
  fields?: DiscordEmbedField[]
  footer?: { text: string; icon_url?: string }
  timestamp?: string
}

export type DiscordWebhookPayload = {
  content?: string
  username?: string
  avatar_url?: string
  embeds?: DiscordEmbed[]
}

export type WatchdogSlotState = {
  service: string
  offlineSince: number | null
  alerted: boolean
  lastAlertAt: number | null
  lastStatus?: string
  lastError?: string
}

export type WatchdogState = {
  slots: Record<string, WatchdogSlotState>
  lastCheckAt: number | null
}

const MONITORED_SERVICES = ["lobby", "world", "channel"] as const
export type MonitoredService = (typeof MONITORED_SERVICES)[number]

const SERVICE_LABELS: Record<MonitoredService, string> = {
  lobby: "Lobby Server",
  world: "World Server",
  channel: "Channel Server",
}

const KEY_WATCHDOG_STATE = "server_watchdog_state"

let memWatchdogState: WatchdogState | null = null

export function getServicePort(service: MonitoredService): number {
  switch (service) {
    case "lobby":
      return getLobbyProbePort()
    case "world":
      return getWorldProbePort()
    case "channel":
      return getChannelProbePort()
  }
}

export function loadWatchdogState(): WatchdogState {
  let raw: string | null = null
  try {
    raw = getSiteSetting(KEY_WATCHDOG_STATE)
  } catch {
    // DB not available
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as WatchdogState
      if (parsed && typeof parsed.slots === "object") {
        return parsed
      }
    } catch {
      // ignore
    }
  }

  if (memWatchdogState) {
    return { ...memWatchdogState }
  }

  const initialSlots: Record<string, WatchdogSlotState> = {}
  for (const s of MONITORED_SERVICES) {
    initialSlots[s] = {
      service: s,
      offlineSince: null,
      alerted: false,
      lastAlertAt: null,
    }
  }

  return {
    slots: initialSlots,
    lastCheckAt: null,
  }
}

export function saveWatchdogState(state: WatchdogState): void {
  memWatchdogState = { ...state }
  try {
    setSiteSetting(KEY_WATCHDOG_STATE, JSON.stringify(state))
  } catch {
    // DB not available
  }
}

export function validateDiscordWebhookUrl(url: string): {
  valid: boolean
  error?: string
} {
  const trimmed = url.trim()
  if (!trimmed) {
    return { valid: false, error: "Discord webhook URL is empty" }
  }
  if (
    !trimmed.startsWith("https://discord.com/api/webhooks/") &&
    !trimmed.startsWith("https://canary.discord.com/api/webhooks/") &&
    !trimmed.startsWith("https://ptb.discord.com/api/webhooks/")
  ) {
    return {
      valid: false,
      error:
        "Webhook must start with https://discord.com/api/webhooks/ (or canary/ptb)",
    }
  }
  return { valid: true }
}

export async function sendDiscordWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const validation = validateDiscordWebhookUrl(webhookUrl)
  if (!validation.valid) {
    return { ok: false, error: validation.error }
  }

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "SMT-Server-Watchdog/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        ok: false,
        status: res.status,
        error: `Discord webhook rejected with HTTP ${res.status}: ${text.slice(0, 160)}`,
      }
    }

    return { ok: true, status: res.status }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to send Discord webhook",
    }
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

/**
 * Format Bootleg Sentry crash alert embed for Discord.
 */
export function buildCrashAlertEmbed(params: {
  service: MonitoredService
  offlineSince: number
  now: number
  processMetric?: OpsProcessMetric
  statusDetail?: string
  logTail?: string
  logSummary?: string
}): DiscordEmbed {
  const {
    service,
    offlineSince,
    now,
    processMetric,
    statusDetail,
    logTail,
    logSummary,
  } = params

  const label = SERVICE_LABELS[service]
  const port = getServicePort(service)
  const elapsedMs = now - offlineSince
  const elapsedSec = Math.round(elapsedMs / 1000)

  // Determine state description
  let stateText = statusDetail || "Unreachable"
  if (processMetric) {
    const parts: string[] = []
    if (processMetric.status) parts.push(processMetric.status)
    if (processMetric.error) parts.push(processMetric.error)
    if (parts.length) {
      stateText = parts.join(" — ")
    }
  }

  const fields: DiscordEmbedField[] = [
    {
      name: "Service",
      value: `\`${label}\` (Port ${port})`,
      inline: true,
    },
    {
      name: "Status",
      value: `\`${stateText}\``,
      inline: true,
    },
    {
      name: "Downtime",
      value: `${elapsedSec}s elapsed`,
      inline: true,
    },
    {
      name: "Offline Since",
      value: `<t:${Math.floor(offlineSince / 1000)}:T> (<t:${Math.floor(offlineSince / 1000)}:R>)`,
      inline: false,
    },
  ]

  if (logSummary) {
    fields.push({
      name: "Last Crash / Critical Log Event",
      value: `\`\`\`${logSummary.slice(0, 300)}\`\`\``,
      inline: false,
    })
  }

  if (logTail && logTail.trim()) {
    // Discord embed fields max 1024 chars. Truncate safely.
    const trimmedLogs = logTail.trim().slice(-900)
    fields.push({
      name: "Recent Logs (Tail)",
      value: `\`\`\`text\n${trimmedLogs}\n\`\`\``,
      inline: false,
    })
  }

  return {
    title: `🚨 [CRASH DETECTED] ${label} is Down`,
    description: `The **${label}** has unexpectedly stopped responding and failed consecutive health checks.`,
    color: 0xed4245, // Discord Red
    fields,
    footer: {
      text: "Bootleg Sentry • SMT Watchdog",
    },
    timestamp: new Date(now).toISOString(),
  }
}

/**
 * Format recovery embed for Discord.
 */
export function buildRecoveryEmbed(params: {
  service: MonitoredService
  offlineSince: number
  now: number
}): DiscordEmbed {
  const { service, offlineSince, now } = params
  const label = SERVICE_LABELS[service]
  const port = getServicePort(service)
  const downtimeMs = now - offlineSince

  return {
    title: `✅ [RESOLVED] ${label} Restored`,
    description: `The **${label}** is healthy, accepting connections, and fully restored.`,
    color: 0x57f287, // Discord Green
    fields: [
      {
        name: "Service",
        value: `\`${label}\` (Port ${port})`,
        inline: true,
      },
      {
        name: "Total Downtime",
        value: formatDuration(downtimeMs),
        inline: true,
      },
      {
        name: "Restored At",
        value: `<t:${Math.floor(now / 1000)}:T> (<t:${Math.floor(now / 1000)}:R>)`,
        inline: false,
      },
    ],
    footer: {
      text: "Bootleg Sentry • SMT Watchdog",
    },
    timestamp: new Date(now).toISOString(),
  }
}

export type CheckServiceResult = {
  service: MonitoredService
  up: boolean
  inMaintenance: boolean
  maintenanceReason?: string
  alertSent: boolean
  recoverySent: boolean
  elapsedSec?: number
  error?: string
}

export type WatchdogCheckSummary = {
  checkedAt: string
  enabled: boolean
  webhookConfigured: boolean
  skipped?: boolean
  skipReason?: string
  results: CheckServiceResult[]
}

/**
 * Perform a single watchdog inspection across lobby, world, and channel.
 */
export async function runWatchdogCheck(options?: {
  now?: number
  dryRun?: boolean
  forceAlert?: boolean
}): Promise<WatchdogCheckSummary> {
  const now = options?.now ?? Date.now()
  const settings = getServerAlertSettings()
  const webhookUrl = settings.discordWebhook
  const thresholdSec = settings.offlineThresholdSec

  if (!settings.enabled && !options?.forceAlert) {
    return {
      checkedAt: new Date(now).toISOString(),
      enabled: false,
      webhookConfigured: Boolean(webhookUrl),
      skipped: true,
      skipReason: "Watchdog alerts are disabled in settings",
      results: [],
    }
  }

  if (!webhookUrl && !options?.dryRun) {
    return {
      checkedAt: new Date(now).toISOString(),
      enabled: settings.enabled,
      webhookConfigured: false,
      skipped: true,
      skipReason: "No Discord webhook URL configured",
      results: [],
    }
  }

  // 1. Gather status from Ops metrics or fallback to TCP probe status
  let metricsProcesses: OpsProcessMetric[] = []
  try {
    const metrics = await getOpsMetrics()
    if (metrics.ok && Array.isArray(metrics.processes)) {
      metricsProcesses = metrics.processes
    }
  } catch {
    // Ops metrics unreachable
  }

  let fallbackStatus: ServiceStatus[] = []
  if (metricsProcesses.length === 0) {
    try {
      fallbackStatus = await collectStatus()
    } catch {
      // Fallback probe failed
    }
  }

  const procByName = new Map(
    metricsProcesses.map((p) => [p.name.toLowerCase(), p])
  )
  const fallbackById = new Map(fallbackStatus.map((s) => [s.id.toLowerCase(), s]))

  const state = loadWatchdogState()
  const results: CheckServiceResult[] = []

  for (const service of MONITORED_SERVICES) {
    const slot = state.slots[service] ?? {
      service,
      offlineSince: null,
      alerted: false,
      lastAlertAt: null,
    }
    state.slots[service] = slot

    // Check if under planned maintenance (admin restart, map upload, admin stop)
    const maint = isServiceInMaintenance(service, now)

    // Determine if service is UP or DOWN
    const proc = procByName.get(service)
    const fallback = fallbackById.get(service)

    let isUp = false
    let statusDetail: string | undefined

    if (proc) {
      isUp = proc.running && !proc.error
      statusDetail = proc.error || proc.status
    } else if (fallback) {
      isUp = fallback.state === "up"
      statusDetail = fallback.detail
    }

    // Process UP state
    if (isUp) {
      let recoverySent = false
      if (slot.alerted && slot.offlineSince !== null) {
        // Send recovery notification
        if (!options?.dryRun && webhookUrl) {
          const recoveryEmbed = buildRecoveryEmbed({
            service,
            offlineSince: slot.offlineSince,
            now,
          })
          await sendDiscordWebhook(webhookUrl, {
            embeds: [recoveryEmbed],
          })
        }
        recoverySent = true
      }

      // Reset slot state
      slot.offlineSince = null
      slot.alerted = false
      slot.lastAlertAt = null
      slot.lastStatus = "up"
      slot.lastError = undefined

      results.push({
        service,
        up: true,
        inMaintenance: maint.inMaintenance,
        maintenanceReason: maint.window?.reason,
        alertSent: false,
        recoverySent,
      })
      continue
    }

    // Process DOWN state
    if (slot.offlineSince === null) {
      slot.offlineSince = now
    }
    const elapsedSec = Math.round((now - slot.offlineSince) / 1000)
    slot.lastStatus = statusDetail || "offline"

    // If service is in planned maintenance, suppress alert!
    if (maint.inMaintenance) {
      results.push({
        service,
        up: false,
        inMaintenance: true,
        maintenanceReason: maint.window?.reason,
        elapsedSec,
        alertSent: false,
        recoverySent: false,
      })
      continue
    }

    let alertSent = false
    let alertError: string | undefined

    // Check if grace period has elapsed and we haven't alerted yet
    const shouldAlert =
      (elapsedSec >= thresholdSec || options?.forceAlert) && !slot.alerted

    if (shouldAlert) {
      // Gather crash log tail from ops sidecar for Bootleg Sentry
      let logTail: string | undefined
      let logSummary = proc?.logSummary

      try {
        const logs = await getOpsServiceLogs(service, { lines: 35 })
        if (logs.ok && logs.text) {
          logTail = logs.text
          if (!logSummary && logs.summary) {
            logSummary = logs.summary
          }
        }
      } catch {
        // Logging probe failed, send alert without logs
      }

      const embed = buildCrashAlertEmbed({
        service,
        offlineSince: slot.offlineSince,
        now,
        processMetric: proc,
        statusDetail,
        logTail,
        logSummary,
      })

      const content = settings.mention ? settings.mention : undefined

      if (!options?.dryRun && webhookUrl) {
        const sendRes = await sendDiscordWebhook(webhookUrl, {
          content,
          embeds: [embed],
        })

        if (sendRes.ok) {
          slot.alerted = true
          slot.lastAlertAt = now
          alertSent = true
        } else {
          alertError = sendRes.error
        }
      } else if (options?.dryRun) {
        slot.alerted = true
        slot.lastAlertAt = now
        alertSent = true
      }
    }

    results.push({
      service,
      up: false,
      inMaintenance: false,
      elapsedSec,
      alertSent,
      recoverySent: false,
      error: alertError,
    })
  }

  state.lastCheckAt = now
  saveWatchdogState(state)

  return {
    checkedAt: new Date(now).toISOString(),
    enabled: settings.enabled,
    webhookConfigured: Boolean(webhookUrl),
    results,
  }
}

/**
 * Send a test Discord alert to verify webhook configuration.
 */
export async function sendTestDiscordAlert(
  customWebhookUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl =
    customWebhookUrl?.trim() || getServerAlertSettings().discordWebhook
  if (!webhookUrl) {
    return { ok: false, error: "No Discord webhook URL provided or configured" }
  }

  const embed: DiscordEmbed = {
    title: "🔍 [TEST] SMT Server Watchdog Connected",
    description:
      "This is a test notification from the SMT Server Watchdog (Bootleg Sentry). Your Discord webhook is configured properly and ready to receive crash alerts.",
    color: 0x5865f2, // Discord Blurple
    fields: [
      {
        name: "Monitored Services",
        value: "`lobby`, `world`, `channel`",
        inline: true,
      },
      {
        name: "Smart Suppression",
        value: "Active during map uploads and admin restarts",
        inline: true,
      },
      {
        name: "Status",
        value: "🟢 Operational",
        inline: true,
      },
    ],
    footer: {
      text: "Bootleg Sentry • SMT Watchdog",
    },
    timestamp: new Date().toISOString(),
  }

  const mention = getServerAlertSettings().mention
  return sendDiscordWebhook(webhookUrl, {
    content: mention ? `${mention} (Test Alert)` : undefined,
    embeds: [embed],
  })
}
