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
  }
}
