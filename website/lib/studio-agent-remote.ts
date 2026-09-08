/**
 * Admin → Wine-host preview/control agent (started by ./studio up).
 */

import {
  getEffectivePortraitPreviewUrl,
  getEffectivePortraitWorkerToken,
} from "@/lib/studio-settings-store"

const DEFAULT_TIMEOUT_MS = Number(
  process.env.PORTRAIT_AGENT_TIMEOUT_MS || 30000
)
const ORCH_DOWN_TIMEOUT_MS = Number(
  process.env.PORTRAIT_ORCH_DOWN_TIMEOUT_MS || 120000
)

export class StudioAgentError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = "StudioAgentError"
    this.status = status
  }
}

export function agentBaseUrl(): string {
  return getEffectivePortraitPreviewUrl().replace(/\/$/, "")
}

function requireAgent(): { baseUrl: string; token: string } {
  const baseUrl = agentBaseUrl()
  if (!baseUrl) {
    throw new StudioAgentError(
      "Preview agent URL not set (Admin → Studio). " +
        "On the Wine host: ./studio up (worker + agent, no game clients).",
      400
    )
  }
  const token = getEffectivePortraitWorkerToken()
  if (!token) {
    throw new StudioAgentError(
      "Worker/studio token missing (Admin → Studio)",
      500
    )
  }
  return { baseUrl, token }
}

async function agentFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { baseUrl, token } = requireAgent()
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const headers = new Headers(init?.headers)
    headers.set("X-Portrait-Worker-Token", token)
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal: ctrl.signal,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new StudioAgentError(
      `Preview agent unreachable (${baseUrl}): ${msg}. ` +
        `On the Wine host run ./studio up.`,
      502
    )
  } finally {
    clearTimeout(timer)
  }
}

async function readAgentJson(res: Response): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> = {}
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    data = {}
  }
  if (!res.ok) {
    const err =
      typeof data.error === "string"
        ? data.error
        : `HTTP ${res.status}`
    throw new StudioAgentError(err, res.status === 409 ? 409 : 502)
  }
  return data
}

export type OrchJob = {
  state?: string
  pid?: number
  maleOnly?: boolean
  startedAt?: number
  endedAt?: number
  exitCode?: number
  message?: string
  logTail?: string
  cmd?: string[]
}

export async function fetchAgentStatus(): Promise<Record<string, unknown>> {
  const res = await agentFetch("/status", { method: "GET" })
  return readAgentJson(res)
}

export async function fetchOrchJob(): Promise<OrchJob> {
  const res = await agentFetch("/orch/job", { method: "GET" })
  const data = await readAgentJson(res)
  return (data.job as OrchJob) || { state: "idle" }
}

export async function startOrchUp(input: {
  maleOnly?: boolean
}): Promise<OrchJob> {
  const res = await agentFetch("/orch/up", {
    method: "POST",
    body: JSON.stringify({ maleOnly: Boolean(input.maleOnly) }),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  })
  const data = await readAgentJson(res)
  return (data.job as OrchJob) || { state: "running" }
}

export async function stopOrchClients(): Promise<{ ok: boolean; detail?: string }> {
  const res = await agentFetch("/orch/down", {
    method: "POST",
    body: "{}",
    timeoutMs: ORCH_DOWN_TIMEOUT_MS,
  })
  const data = await readAgentJson(res)
  return {
    ok: Boolean(data.ok ?? true),
    detail: typeof data.detail === "string" ? data.detail : undefined,
  }
}

export type LoginStep = "login" | "credentials" | "start" | "full"

export async function startLoginStep(input: {
  role: "vam1" | "vaf1"
  step?: LoginStep
}): Promise<OrchJob> {
  const res = await agentFetch("/login", {
    method: "POST",
    body: JSON.stringify({
      role: input.role,
      step: input.step ?? "login",
    }),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  })
  const data = await readAgentJson(res)
  return (data.loginJob as OrchJob) || { state: "running" }
}

export type ClientAction = "start" | "stop" | "restart"

export async function clientAction(input: {
  role: "vam1" | "vaf1"
  action: ClientAction
}): Promise<Record<string, unknown>> {
  const res = await agentFetch("/client", {
    method: "POST",
    body: JSON.stringify({
      role: input.role,
      action: input.action,
    }),
    timeoutMs:
      input.action === "stop" ? ORCH_DOWN_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
  })
  return readAgentJson(res)
}
