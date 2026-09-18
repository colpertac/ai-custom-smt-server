/**
 * Background poller: Discord when a new open lobby report appears.
 * Uses COMP_ANNOUNCE_* service credentials (no browser session).
 *
 * First successful poll seeds seen UIDs without notifying (avoids blasting
 * every historical open report after deploy / toggle-on).
 */
import {
  adminListReports,
  authenticate,
  type AdminReport,
} from "@/lib/comp-api"
import { DEFAULT_WORLD_ID } from "@/lib/comp-api-errors"
import { notifyNewReport } from "@/lib/discord-notify"
import {
  getNotificationSettings,
  getSiteSetting,
  setSiteSetting,
} from "@/lib/site-settings-store"

const KEY_SEEN_UIDS = "report_notify_seen_uids"
const KEY_SEEDED = "report_notify_seeded"
const MAX_SEEN = 500

function getServiceCredentials(): { user: string; password: string } | null {
  const user = process.env.COMP_ANNOUNCE_USER?.trim()
  const password = process.env.COMP_ANNOUNCE_PASSWORD
  if (!user || password == null || password === "") return null
  return { user, password }
}

function loadSeenUids(): Set<string> {
  try {
    const raw = getSiteSetting(KEY_SEEN_UIDS)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter((x): x is string => typeof x === "string" && x.length > 0)
    )
  } catch {
    return new Set()
  }
}

function saveSeenUids(uids: Set<string>): void {
  const list = [...uids]
  // Keep newest-ish by truncating from the front if oversized
  const trimmed =
    list.length > MAX_SEEN ? list.slice(list.length - MAX_SEEN) : list
  try {
    setSiteSetting(KEY_SEEN_UIDS, JSON.stringify(trimmed))
  } catch {
    // DB unavailable
  }
}

function isSeeded(): boolean {
  try {
    const v = getSiteSetting(KEY_SEEDED)
    return v === "1" || v === "true"
  } catch {
    return false
  }
}

function markSeeded(): void {
  try {
    setSiteSetting(KEY_SEEDED, "1")
  } catch {
    // DB unavailable
  }
}

export type ReportNotifyPollSummary = {
  checkedAt: string
  skipped?: boolean
  skipReason?: string
  openCount?: number
  newCount?: number
  notified?: number
  seeded?: boolean
  error?: string
}

export async function runReportNotifyPoll(): Promise<ReportNotifyPollSummary> {
  const checkedAt = new Date().toISOString()
  const settings = getNotificationSettings()

  if (!settings.discordWebhook.trim()) {
    return {
      checkedAt,
      skipped: true,
      skipReason: "No Discord webhook configured",
    }
  }
  if (!settings.notifyReports) {
    return {
      checkedAt,
      skipped: true,
      skipReason: "Report notifications disabled",
    }
  }

  const creds = getServiceCredentials()
  if (!creds) {
    return {
      checkedAt,
      skipped: true,
      skipReason: "COMP_ANNOUNCE_USER / COMP_ANNOUNCE_PASSWORD not configured",
    }
  }

  let reports: AdminReport[]
  try {
    const auth = await authenticate(creds.user, creds.password, {
      timeoutMs: 8_000,
    })
    reports = await adminListReports(auth, {
      worldId: DEFAULT_WORLD_ID,
      resolved: false,
      limit: 100,
    })
  } catch (err) {
    return {
      checkedAt,
      error:
        err instanceof Error ? err.message : "Failed to list open reports",
    }
  }

  const openUids = new Set(
    reports.map((r) => r.uid).filter((uid) => uid.length > 0)
  )
  const seen = loadSeenUids()

  if (!isSeeded()) {
    for (const uid of openUids) seen.add(uid)
    // Drop resolved UIDs that are no longer open
    for (const uid of [...seen]) {
      if (!openUids.has(uid)) seen.delete(uid)
    }
    saveSeenUids(seen)
    markSeeded()
    return {
      checkedAt,
      openCount: reports.length,
      newCount: 0,
      notified: 0,
      seeded: true,
    }
  }

  // Prune resolved / missing from seen
  for (const uid of [...seen]) {
    if (!openUids.has(uid)) seen.delete(uid)
  }

  const fresh = reports.filter((r) => r.uid && !seen.has(r.uid))
  let notified = 0
  for (const report of fresh) {
    const result = await notifyNewReport(report)
    if (result.ok) notified += 1
    else if (!result.skipped) {
      console.error(
        "[ReportNotify]",
        report.uid,
        result.error || "Discord send failed"
      )
    }
    seen.add(report.uid)
  }

  saveSeenUids(seen)

  return {
    checkedAt,
    openCount: reports.length,
    newCount: fresh.length,
    notified,
  }
}
