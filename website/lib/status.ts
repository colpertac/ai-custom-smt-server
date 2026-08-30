import net from "node:net"

import {
  getChannelProbeHost,
  getChannelProbePort,
  getCompApiUrl,
  getLobbyProbeHost,
  getLobbyProbePort,
  getUpdaterProbeUrl,
  getWorldProbeHost,
  getWorldProbePort,
} from "@/lib/env"
import { getOpsMetrics, opsToken } from "@/lib/ops-sidecar"

export type ProbeState = "up" | "down" | "skipped"

export type ServiceStatus = {
  id: string
  label: string
  state: ProbeState
  detail?: string
}

const GAME_SERVICE_ORDER = ["lobby", "world", "channel"] as const

function probeTcp(host: string, port: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (ok: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false))
    socket.once("error", () => done(false))
  })
}

function capitalizeService(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

async function collectGameServicesFromOps(): Promise<ServiceStatus[] | null> {
  if (!opsToken()) return null

  try {
    const metrics = await getOpsMetrics()
    if (!metrics.ok && !metrics.processes?.length) return null

    const byName = new Map(
      (metrics.processes ?? []).map((proc) => [proc.name.toLowerCase(), proc])
    )

    return GAME_SERVICE_ORDER.map((id) => {
      const proc = byName.get(id)
      if (!proc) {
        return {
          id,
          label: capitalizeService(id),
          state: "down" as const,
        }
      }

      const up = proc.running && !proc.error
      return {
        id,
        label: capitalizeService(id),
        state: up ? ("up" as const) : ("down" as const),
      }
    })
  } catch {
    return null
  }
}

async function probeLobbyApi(): Promise<{ up: boolean; detail: string }> {
  try {
    const response = await fetch(`${getCompApiUrl()}/api/auth/get_challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "statusprobe" }),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })
    if (response.status < 500) {
      return { up: true, detail: `HTTP ${response.status}` }
    }
    return { up: false, detail: `HTTP ${response.status}` }
  } catch (error) {
    return {
      up: false,
      detail: error instanceof Error ? error.message : "unreachable",
    }
  }
}

async function collectGameServicesFallback(): Promise<ServiceStatus[]> {
  const lobbyHost = getLobbyProbeHost()
  const worldHost = getWorldProbeHost()
  const channelHost = getChannelProbeHost()

  const [lobbyApi, lobbyTcp, worldTcp, channelTcp] = await Promise.all([
    probeLobbyApi(),
    probeTcp(lobbyHost, getLobbyProbePort()),
    probeTcp(worldHost, getWorldProbePort()),
    probeTcp(channelHost, getChannelProbePort()),
  ])

  return [
    {
      id: "lobby",
      label: "Lobby",
      state: lobbyApi.up || lobbyTcp ? "up" : "down",
    },
    {
      id: "world",
      label: "World",
      state: worldTcp ? "up" : "down",
    },
    {
      id: "channel",
      label: "Channel",
      state: channelTcp ? "up" : "down",
    },
  ]
}

async function probeUpdater(): Promise<ServiceStatus> {
  const base = getUpdaterProbeUrl()
  if (!base) {
    return {
      id: "updater",
      label: "Updater",
      state: "skipped",
    }
  }

  try {
    const response = await fetch(`${base}/files/hashlist.ver`, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })
    return {
      id: "updater",
      label: "Updater",
      state: response.ok ? "up" : "down",
    }
  } catch {
    return {
      id: "updater",
      label: "Updater",
      state: "down",
    }
  }
}

export async function collectStatus(): Promise<ServiceStatus[]> {
  const [gameServices, updater] = await Promise.all([
    collectGameServicesFromOps().then(
      (fromOps) => fromOps ?? collectGameServicesFallback()
    ),
    probeUpdater(),
  ])

  return [
    ...gameServices,
    updater,
  ]
}
