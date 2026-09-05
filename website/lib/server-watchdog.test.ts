import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearPlannedMaintenance,
  isServiceInMaintenance,
  setPlannedMaintenance,
} from "@/lib/planned-maintenance"
import {
  buildCrashAlertEmbed,
  buildRecoveryEmbed,
  loadWatchdogState,
  runWatchdogCheck,
  saveWatchdogState,
  validateDiscordWebhookUrl,
} from "@/lib/server-watchdog"
import * as opsSidecar from "@/lib/ops-sidecar"
import * as siteSettingsStore from "@/lib/site-settings-store"
import * as statusLib from "@/lib/status"

describe("server-watchdog", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe("validateDiscordWebhookUrl", () => {
    it("rejects empty webhook URL", () => {
      expect(validateDiscordWebhookUrl("").valid).toBe(false)
      expect(validateDiscordWebhookUrl("   ").valid).toBe(false)
    })

    it("rejects non-discord webhook URLs", () => {
      expect(
        validateDiscordWebhookUrl("https://example.com/webhook").valid
      ).toBe(false)
      expect(
        validateDiscordWebhookUrl("http://discord.com/api/webhooks/123/abc").valid
      ).toBe(false)
    })

    it("accepts valid Discord webhook URLs", () => {
      expect(
        validateDiscordWebhookUrl(
          "https://discord.com/api/webhooks/123456789/abcdef"
        ).valid
      ).toBe(true)
      expect(
        validateDiscordWebhookUrl(
          "https://canary.discord.com/api/webhooks/123456789/abcdef"
        ).valid
      ).toBe(true)
      expect(
        validateDiscordWebhookUrl(
          "https://ptb.discord.com/api/webhooks/123456789/abcdef"
        ).valid
      ).toBe(true)
    })
  })

  describe("buildCrashAlertEmbed", () => {
    it("formats embed with crash details, exit code, and log snippets", () => {
      const now = 1700000060000
      const offlineSince = 1700000000000

      const embed = buildCrashAlertEmbed({
        service: "channel",
        offlineSince,
        now,
        processMetric: {
          name: "channel",
          running: false,
          status: "exited",
          error: "exit 139 (SIGSEGV)",
        },
        logSummary: "FATAL: segmentation fault on item use 4812",
        logTail: "Item 4812 spawned\nPacket parse error\nCrash trace...",
      })

      expect(embed.title).toContain("Channel Server is Down")
      expect(embed.color).toBe(0xed4245)

      const fieldNames = embed.fields?.map((f) => f.name)
      expect(fieldNames).toContain("Service")
      expect(fieldNames).toContain("Status")
      expect(fieldNames).toContain("Downtime")
      expect(fieldNames).toContain("Last Crash / Critical Log Event")
      expect(fieldNames).toContain("Recent Logs (Tail)")

      const statusField = embed.fields?.find((f) => f.name === "Status")
      expect(statusField?.value).toContain("exit 139 (SIGSEGV)")

      const crashField = embed.fields?.find(
        (f) => f.name === "Last Crash / Critical Log Event"
      )
      expect(crashField?.value).toContain("segmentation fault on item use 4812")
    })

    it("truncates very long log tails safely", () => {
      const hugeLog = "A".repeat(2000)
      const embed = buildCrashAlertEmbed({
        service: "world",
        offlineSince: Date.now() - 10000,
        now: Date.now(),
        logTail: hugeLog,
      })

      const logField = embed.fields?.find((f) => f.name === "Recent Logs (Tail)")
      expect(logField).toBeDefined()
      expect(logField?.value.length).toBeLessThan(1024)
    })
  })

  describe("buildRecoveryEmbed", () => {
    it("formats recovery embed with green color and total downtime", () => {
      const offlineSince = 1700000000000
      const now = 1700000095000 // 95 seconds downtime

      const embed = buildRecoveryEmbed({
        service: "channel",
        offlineSince,
        now,
      })

      expect(embed.title).toContain("Channel Server Restored")
      expect(embed.color).toBe(0x57f287)

      const downtimeField = embed.fields?.find((f) => f.name === "Total Downtime")
      expect(downtimeField?.value).toBe("1m 35s")
    })
  })

  describe("planned-maintenance suppression", () => {
    it("tracks and checks active maintenance windows", () => {
      const baseTime = 1700000000000

      // Register maintenance for channel for 180s
      setPlannedMaintenance(
        ["channel"],
        "admin_restart",
        180,
        "admin",
        "test",
        baseTime
      )

      // Active during window
      const checkActive = isServiceInMaintenance("channel", baseTime + 60_000)
      expect(checkActive.inMaintenance).toBe(true)
      expect(checkActive.window?.reason).toBe("admin_restart")

      // Other services not affected
      expect(isServiceInMaintenance("lobby", baseTime + 60_000).inMaintenance).toBe(false)

      // Cleared after expiry (180s = 180,000ms)
      const checkExpired = isServiceInMaintenance(
        "channel",
        baseTime + 200_000
      )
      expect(checkExpired.inMaintenance).toBe(false)
    })

    it("supports global 'all' maintenance and manual clear", () => {
      const baseTime = 1000000000

      setPlannedMaintenance(["all"], "admin_stop", null, "admin")
      expect(isServiceInMaintenance("lobby", baseTime).inMaintenance).toBe(true)
      expect(isServiceInMaintenance("channel", baseTime).inMaintenance).toBe(true)

      clearPlannedMaintenance(["all", "lobby", "channel"])
      expect(isServiceInMaintenance("lobby", baseTime).inMaintenance).toBe(false)
      expect(isServiceInMaintenance("channel", baseTime).inMaintenance).toBe(false)
    })
  })

  describe("runWatchdogCheck", () => {
    it("suppresses alerts when service is under planned maintenance", async () => {
      const now = 1700000000000

      vi.spyOn(siteSettingsStore, "getServerAlertSettings").mockReturnValue({
        discordWebhook: "https://discord.com/api/webhooks/123/fake",
        enabled: true,
        offlineThresholdSec: 60,
        mention: "",
      })

      // Channel is down according to metrics
      vi.spyOn(opsSidecar, "getOpsMetrics").mockResolvedValue({
        ok: true,
        processes: [
          { name: "lobby", running: true },
          { name: "world", running: true },
          { name: "channel", running: false, error: "crash" },
        ],
      })

      // Put channel in maintenance (e.g. admin uploaded map)
      setPlannedMaintenance(["channel"], "map_upload", 300, "admin")

      // Initialize slot state as offline for > 60s
      saveWatchdogState({
        slots: {
          channel: {
            service: "channel",
            offlineSince: now - 120_000,
            alerted: false,
            lastAlertAt: null,
          },
          lobby: {
            service: "lobby",
            offlineSince: null,
            alerted: false,
            lastAlertAt: null,
          },
          world: {
            service: "world",
            offlineSince: null,
            alerted: false,
            lastAlertAt: null,
          },
        },
        lastCheckAt: now,
      })

      const summary = await runWatchdogCheck({ now, dryRun: true })
      const channelResult = summary.results.find((r) => r.service === "channel")

      expect(channelResult?.up).toBe(false)
      expect(channelResult?.inMaintenance).toBe(true)
      expect(channelResult?.alertSent).toBe(false)

      clearPlannedMaintenance(["channel"])
    })

    it("respects debounce threshold before alerting and alerts once threshold reached", async () => {
      const now = 1700000000000

      vi.spyOn(siteSettingsStore, "getServerAlertSettings").mockReturnValue({
        discordWebhook: "https://discord.com/api/webhooks/123/fake",
        enabled: true,
        offlineThresholdSec: 60,
        mention: "",
      })

      vi.spyOn(opsSidecar, "getOpsMetrics").mockResolvedValue({
        ok: true,
        processes: [
          { name: "lobby", running: true },
          { name: "world", running: true },
          { name: "channel", running: false, error: "crash" },
        ],
      })

      clearPlannedMaintenance(["channel", "all"])

      // 1. Initial down tick (offline for only 10s)
      saveWatchdogState({
        slots: {
          channel: {
            service: "channel",
            offlineSince: now - 10_000,
            alerted: false,
            lastAlertAt: null,
          },
          lobby: {
            service: "lobby",
            offlineSince: null,
            alerted: false,
            lastAlertAt: null,
          },
          world: {
            service: "world",
            offlineSince: null,
            alerted: false,
            lastAlertAt: null,
          },
        },
        lastCheckAt: now,
      })

      const tick1 = await runWatchdogCheck({ now, dryRun: true })
      const channelTick1 = tick1.results.find((r) => r.service === "channel")
      expect(channelTick1?.alertSent).toBe(false)

      // 2. Later tick (offline for 65s, threshold is 60s)
      const laterNow = now + 65_000
      const tick2 = await runWatchdogCheck({ now: laterNow, dryRun: true })
      const channelTick2 = tick2.results.find((r) => r.service === "channel")
      expect(channelTick2?.alertSent).toBe(true)

      const stateAfterAlert = loadWatchdogState()
      expect(stateAfterAlert.slots.channel?.alerted).toBe(true)

      // 3. Next tick while still down does not alert again (deduplication)
      const tick3 = await runWatchdogCheck({ now: laterNow + 20_000, dryRun: true })
      const channelTick3 = tick3.results.find((r) => r.service === "channel")
      expect(channelTick3?.alertSent).toBe(false)

      // 4. Service comes back online -> triggers recovery notification
      vi.spyOn(opsSidecar, "getOpsMetrics").mockResolvedValue({
        ok: true,
        processes: [
          { name: "lobby", running: true },
          { name: "world", running: true },
          { name: "channel", running: true },
        ],
      })

      const tick4 = await runWatchdogCheck({ now: laterNow + 40_000, dryRun: true })
      const channelTick4 = tick4.results.find((r) => r.service === "channel")
      expect(channelTick4?.up).toBe(true)
      expect(channelTick4?.recoverySent).toBe(true)

      const stateAfterRecovery = loadWatchdogState()
      expect(stateAfterRecovery.slots.channel?.alerted).toBe(false)
      expect(stateAfterRecovery.slots.channel?.offlineSince).toBeNull()
    })
  })
})
