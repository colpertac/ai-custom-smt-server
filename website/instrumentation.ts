/**
 * Next.js Instrumentation hook.
 * Runs on server startup in Node.js runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const g = globalThis as unknown as {
      __serverWatchdogInterval?: NodeJS.Timeout
      __eventScheduleInterval?: NodeJS.Timeout
    }

    if (!g.__serverWatchdogInterval) {
      const { runWatchdogCheck } = await import("@/lib/server-watchdog")

      // Allow Next.js server and containers 15 seconds to settle on startup
      setTimeout(() => {
        void runWatchdogCheck().catch(() => {})
      }, 15_000)

      g.__serverWatchdogInterval = setInterval(() => {
        void runWatchdogCheck().catch((err) => {
          console.error("[Server Watchdog]", err)
        })
      }, 20_000)

      if (typeof g.__serverWatchdogInterval.unref === "function") {
        g.__serverWatchdogInterval.unref()
      }
    }

    // Event schedule reconciler — loop calendar → channel.xml + restart
    if (!g.__eventScheduleInterval) {
      const { runEventScheduleReconcile } = await import(
        "@/lib/events/event-schedule-reconciler"
      )

      setTimeout(() => {
        void runEventScheduleReconcile().catch((err) => {
          console.error("[EventSchedule]", err)
        })
      }, 45_000)

      g.__eventScheduleInterval = setInterval(() => {
        void runEventScheduleReconcile().catch((err) => {
          console.error("[EventSchedule]", err)
        })
      }, 60_000)

      if (typeof g.__eventScheduleInterval.unref === "function") {
        g.__eventScheduleInterval.unref()
      }
    }

    // New in-game report → Discord (COMP_ANNOUNCE_* poll)
    const gReports = globalThis as unknown as {
      __reportNotifyInterval?: NodeJS.Timeout
    }
    if (!gReports.__reportNotifyInterval) {
      const { runReportNotifyPoll } = await import(
        "@/lib/report-notify-poller"
      )

      setTimeout(() => {
        void runReportNotifyPoll().catch((err) => {
          console.error("[ReportNotify]", err)
        })
      }, 30_000)

      gReports.__reportNotifyInterval = setInterval(() => {
        void runReportNotifyPoll().catch((err) => {
          console.error("[ReportNotify]", err)
        })
      }, 45_000)

      if (typeof gReports.__reportNotifyInterval.unref === "function") {
        gReports.__reportNotifyInterval.unref()
      }
    }
  }
}
