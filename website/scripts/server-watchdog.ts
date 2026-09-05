#!/usr/bin/env node
/**
 * Standalone CLI runner for the SMT Server Watchdog (Bootleg Sentry).
 *
 * Usage:
 *   pnpm run server-watchdog --test          # Send one test Discord notification
 *   pnpm run server-watchdog --once          # Run one health check and print status
 *   pnpm run server-watchdog --once --dry-run
 *   pnpm run server-watchdog                 # Run continuous polling loop
 */
import fs from "node:fs"
import path from "node:path"

// Simple dotenv loader for standalone CLI runs
function loadDotenvFiles(): void {
  const root = path.resolve(import.meta.dirname, "..")
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(root, filename)
    if (!fs.existsSync(filePath)) continue
    try {
      const content = fs.readFileSync(filePath, "utf-8")
      for (const line of content.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const eqIdx = trimmed.indexOf("=")
        if (eqIdx === -1) continue
        const key = trimmed.slice(0, eqIdx).trim()
        let val = trimmed.slice(eqIdx + 1).trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        if (!(key in process.env)) {
          process.env[key] = val
        }
      }
    } catch {
      // ignore
    }
  }
}

loadDotenvFiles()

import {
  runWatchdogCheck,
  sendTestDiscordAlert,
} from "../lib/server-watchdog.ts"
import { getServerAlertSettings } from "../lib/site-settings-store.ts"

const args = process.argv.slice(2)
const isTest = args.includes("--test")
const isOnce = args.includes("--once")
const isDryRun = args.includes("--dry-run")
const isJson = args.includes("--json")

async function main() {
  const settings = getServerAlertSettings()

  if (isTest) {
    console.log("Sending test Discord alert...")
    console.log(`Webhook URL: ${settings.discordWebhook ? "(configured)" : "(NOT CONFIGURED)"}`)
    const result = await sendTestDiscordAlert()
    if (result.ok) {
      console.log("Test alert sent successfully!")
      process.exit(0)
    } else {
      console.error(`Failed to send test alert: ${result.error}`)
      process.exit(1)
    }
  }

  if (isOnce) {
    const summary = await runWatchdogCheck({ dryRun: isDryRun })
    if (isJson) {
      console.log(JSON.stringify(summary, null, 2))
    } else {
      console.log(`[Watchdog] Checked at ${summary.checkedAt}`)
      if (summary.skipped) {
        console.log(`[Watchdog] Skipped: ${summary.skipReason}`)
      } else {
        for (const res of summary.results) {
          const status = res.up ? "UP" : "DOWN"
          const maint = res.inMaintenance ? ` (MAINTENANCE: ${res.maintenanceReason})` : ""
          const alert = res.alertSent ? " -> CRASH ALERT SENT" : res.recoverySent ? " -> RECOVERY SENT" : ""
          console.log(` - ${res.service.toUpperCase()}: ${status}${maint}${alert}`)
        }
      }
    }
    process.exit(0)
  }

  // Continuous monitoring loop
  const intervalSec = 20
  console.log(`[Watchdog] Starting continuous server watchdog (polling every ${intervalSec}s)...`)
  console.log(`[Watchdog] Webhook: ${settings.discordWebhook ? "Active" : "None"}`)
  console.log(`[Watchdog] Offline alert threshold: ${settings.offlineThresholdSec}s`)

  const tick = async () => {
    try {
      const summary = await runWatchdogCheck({ dryRun: isDryRun })
      if (!summary.skipped) {
        for (const res of summary.results) {
          if (res.alertSent) {
            console.log(`🚨 [ALERT] Dispatched crash alert for ${res.service}`)
          }
          if (res.recoverySent) {
            console.log(`✅ [RECOVERY] Dispatched recovery notification for ${res.service}`)
          }
        }
      }
    } catch (err) {
      console.error("[Watchdog] Tick error:", err)
    }
  }

  // Initial immediate tick
  await tick()

  // Loop
  setInterval(() => {
    void tick()
  }, intervalSec * 1000)
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
