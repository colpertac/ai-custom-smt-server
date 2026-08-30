import { adminGetOnline } from "@/lib/comp-api"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getOpsMetrics } from "@/lib/ops-sidecar"
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
  } = { total: 0, worlds: [], error: "unavailable" }

  try {
    players = await withCompSession(async (session) => {
      const online = await adminGetOnline(session)
      return { total: online.total, worlds: online.worlds }
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    players = {
      total: 0,
      worlds: [],
      error: error instanceof Error ? error.message : "lobby online failed",
    }
  }

  try {
    const metrics = await getOpsMetrics(gate.username)
    if (!metrics.ok && metrics.error === "unauthorized") {
      return apiFail("Ops token rejected by sidecar", 502, "OPS")
    }
    return apiOk({
      players,
      host: metrics.host ?? null,
      processes: metrics.processes ?? [],
      backend: metrics.backend ?? null,
      ok: metrics.ok,
      error: metrics.error,
    })
  } catch (error) {
    return apiOk({
      players,
      host: null,
      processes: [],
      backend: null,
      ok: false,
      error:
        error instanceof Error ? error.message : "Ops sidecar metrics failed",
    })
  }
}
