import net from "node:net"

import {
  getChannelProbeHost,
  getChannelProbePort,
  getCompApiUrl,
  getLobbyProbeHost,
  getLobbyProbePort,
  getUpdaterProbeUrl,
} from "@/lib/env"

export type ProbeState = "up" | "down" | "skipped"

export type ServiceStatus = {
  id: string
  label: string
  state: ProbeState
  detail?: string
}

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

async function probeLobbyApi(): Promise<ServiceStatus> {
  try {
    const response = await fetch(`${getCompApiUrl()}/api/auth/get_challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "statusprobe" }),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })
    // Any HTTP response means the lobby process answered.
    if (response.status < 500) {
      return {
        id: "lobby-api",
        label: "Lobby API",
        state: "up",
        detail: `HTTP ${response.status}`,
      }
    }
    return {
      id: "lobby-api",
      label: "Lobby API",
      state: "down",
      detail: `HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      id: "lobby-api",
      label: "Lobby API",
      state: "down",
      detail: error instanceof Error ? error.message : "unreachable",
    }
  }
}

async function probeUpdater(): Promise<ServiceStatus> {
  const base = getUpdaterProbeUrl()
  if (!base) {
    return {
      id: "updater",
      label: "Updater",
      state: "skipped",
      detail: "Set UPDATER_PROBE_URL or PUBLIC_UPDATER_URL",
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
      detail: `HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      id: "updater",
      label: "Updater",
      state: "down",
      detail: error instanceof Error ? error.message : "unreachable",
    }
  }
}

export async function collectStatus(): Promise<ServiceStatus[]> {
  const lobbyHost = getLobbyProbeHost()
  const channelHost = getChannelProbeHost()
  const lobbyPort = getLobbyProbePort()
  const channelPort = getChannelProbePort()

  const [lobbyApi, lobbyTcp, channelTcp, updater] = await Promise.all([
    probeLobbyApi(),
    probeTcp(lobbyHost, lobbyPort).then((ok) => ({
      id: "lobby-tcp",
      label: `Lobby TCP (${lobbyHost}:${lobbyPort})`,
      state: (ok ? "up" : "down") as ProbeState,
    })),
    probeTcp(channelHost, channelPort).then((ok) => ({
      id: "channel-tcp",
      label: `Channel TCP (${channelHost}:${channelPort})`,
      state: (ok ? "up" : "down") as ProbeState,
    })),
    probeUpdater(),
  ])

  return [
    {
      id: "website",
      label: "Website",
      state: "up",
      detail: "This page loaded",
    },
    lobbyApi,
    lobbyTcp,
    channelTcp,
    updater,
  ]
}
