import { adminGetOnline } from "@/lib/comp-api"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getOpsMetrics } from "@/lib/ops-sidecar"
import { getStudioHealth } from "@/lib/studio-api"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"

export async function GET() {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let players: {
    total: number
    worlds: { worldId: number; characterCount: number }[]
    error?: string
  }
  let mannequins: { online: number; names: string[] } | null
  let metrics: Awaited<ReturnType<typeof getOpsMetrics>>
  try {
    ;[players, mannequins, metrics] = await Promise.all([
      (async () => {
        try {
          return await withCompSession(async (session) => {
            const online = await adminGetOnline(session)
            return { total: online.total, worlds: online.worlds }
          })
        } catch (error) {
          if (error instanceof CompSessionMissingError) {
            throw error
          }
          return {
            total: 0,
            worlds: [] as { worldId: number; characterCount: number }[],
            error:
              error instanceof Error ? error.message : "lobby online failed",
          }
        }
      })(),
      (async () => {
        try {
          const health = await getStudioHealth({
            signal: AbortSignal.timeout(1_500),
          })
          if (
            health.ok ||
            health.vam1 ||
            health.vaf1 ||
            health.vam ||
            health.vaf
          ) {
            const names: string[] = []
            if (health.vam1 || health.vam) names.push("vam")
            if (health.vaf1 || health.vaf) names.push("vaf")
            return { online: names.length, names }
          }
        } catch {
          /* studio down / unset token */
        }
        return null
      })(),
      getOpsMetrics(gate.username).catch((error: unknown) => ({
        ok: false,
        error:
          error instanceof Error ? error.message : "Ops sidecar metrics failed",
      })),
    ])
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    throw error
  }

  if (!metrics.ok && metrics.error === "unauthorized") {
    return apiFail("Ops token rejected by sidecar", 502, "OPS")
  }
  return apiOk({
    players,
    mannequins,
    host: metrics.host ?? null,
    processes: metrics.processes ?? [],
    backend: metrics.backend ?? null,
    ok: metrics.ok,
    error: metrics.error,
  })
}
