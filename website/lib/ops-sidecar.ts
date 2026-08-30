/**
 * Server-only proxy to the Phase 16I ops sidecar (127.0.0.1).
 * Never expose OPS_TOKEN to the browser.
 */

export type OpsFirstBootBucket = {
  files: number
  ready: boolean
  optional?: boolean
  path?: string
  hint?: string
}

export type OpsFirstBoot = {
  needed: boolean
  ready: boolean
  missing: string[]
  binarydata?: OpsFirstBootBucket
  maps?: OpsFirstBootBucket
  serverdata?: OpsFirstBootBucket
  packages?: OpsFirstBootBucket
  overlay?: OpsFirstBootBucket
}

export type OpsHealth = {
  ok: boolean
  service?: string
  backend?: string
  verbs?: string[]
  error?: string
  channelStale?: boolean
  lastContentChangeAt?: string | null
  lastContentKinds?: string[]
  lastContentSource?: string | null
  lastChannelRestartAt?: string | null
  overlayStale?: boolean
  lastOverlayChangeAt?: string | null
  lastOverlayRehashAt?: string | null
  lastOverlaySource?: string | null
  firstBoot?: OpsFirstBoot
}

export type OpsProcessMetric = {
  name: string
  running: boolean
  pid?: number | null
  rssBytes?: number | null
  cpuPercent?: number | null
  container?: string
  /** Docker state: running | exited | restarting | … */
  status?: string
  error?: string
  /** Last CRITICAL/ERROR (or last line) from service log when offline. */
  logSummary?: string
}

export type OpsHostMetrics = {
  cpuPercent?: number | null
  memUsedBytes?: number | null
  memTotalBytes?: number | null
  memAvailableBytes?: number | null
}

export type OpsMetrics = {
  ok: boolean
  backend?: string
  service?: string
  error?: string
  host?: OpsHostMetrics
  processes?: OpsProcessMetric[]
}

export type OpsRestartChannelResult = {
  ok: boolean
  service?: string
  backend?: string
  message?: string
  detail?: string
  error?: string
}

export type OpsServerActionResult = {
  ok: boolean
  service?: string
  backend?: string
  message?: string
  detail?: string
  error?: string
}

export type OpsLaneAPublishResult = {
  ok: boolean
  lane?: string
  backend?: string
  message?: string
  detail?: string
  error?: string
  phase?: string
  releaseId?: string
  restarted?: boolean
  shopsCopied?: number
  payoutsPackaged?: number
  reportRewardsPackaged?: number
  disabledPayouts?: string[]
  disabledReportRewards?: string[]
  skippedConflicts?: string[]
  warnings?: string[]
  errors?: string[]
  restartError?: string
  clientOverlayUpdated?: boolean
  customEventMessages?: Array<{ id: number; lines: string[] }>
}

function mapOpsLaneAResult(
  status: number,
  json: Record<string, unknown>
): OpsLaneAPublishResult {
  if (status === 401) {
    return { ok: false, error: "unauthorized" }
  }
  return {
    ok: Boolean(json.ok),
    lane: typeof json.lane === "string" ? json.lane : undefined,
    backend: typeof json.backend === "string" ? json.backend : undefined,
    message: typeof json.message === "string" ? json.message : undefined,
    detail: typeof json.detail === "string" ? json.detail : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
    phase: typeof json.phase === "string" ? json.phase : undefined,
    releaseId:
      typeof json.releaseId === "string" ? json.releaseId : undefined,
    restarted:
      typeof json.restarted === "boolean" ? json.restarted : undefined,
    shopsCopied:
      typeof json.shopsCopied === "number" ? json.shopsCopied : undefined,
    payoutsPackaged:
      typeof json.payoutsPackaged === "number"
        ? json.payoutsPackaged
        : undefined,
    reportRewardsPackaged:
      typeof json.reportRewardsPackaged === "number"
        ? json.reportRewardsPackaged
        : undefined,
    disabledPayouts: Array.isArray(json.disabledPayouts)
      ? json.disabledPayouts.filter((v): v is string => typeof v === "string")
      : undefined,
    disabledReportRewards: Array.isArray(json.disabledReportRewards)
      ? json.disabledReportRewards.filter(
          (v): v is string => typeof v === "string"
        )
      : undefined,
    skippedConflicts: Array.isArray(json.skippedConflicts)
      ? json.skippedConflicts.filter((v): v is string => typeof v === "string")
      : undefined,
    warnings: Array.isArray(json.warnings)
      ? json.warnings.filter((v): v is string => typeof v === "string")
      : undefined,
    errors: Array.isArray(json.errors)
      ? json.errors.filter((v): v is string => typeof v === "string")
      : undefined,
    restartError:
      typeof json.restartError === "string" ? json.restartError : undefined,
    clientOverlayUpdated:
      typeof json.clientOverlayUpdated === "boolean"
        ? json.clientOverlayUpdated
        : undefined,
    customEventMessages: Array.isArray(json.customEventMessages)
      ? (json.customEventMessages as Array<{ id: number; lines: string[] }>)
      : undefined,
  }
}

export function opsBaseUrl(): string {
  const custom = process.env.OPS_URL?.trim()
  if (custom) return custom.replace(/\/$/, "")
  return "http://127.0.0.1:14710"
}

export function opsToken(): string {
  return process.env.OPS_TOKEN?.trim() || ""
}

function parseFirstBootBucket(raw: unknown): OpsFirstBootBucket | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const o = raw as Record<string, unknown>
  return {
    files: typeof o.files === "number" ? o.files : 0,
    ready: Boolean(o.ready),
    optional: Boolean(o.optional),
    path: typeof o.path === "string" ? o.path : undefined,
    hint: typeof o.hint === "string" ? o.hint : undefined,
  }
}

function parseFirstBoot(raw: unknown): OpsFirstBoot | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const o = raw as Record<string, unknown>
  const missing = Array.isArray(o.missing)
    ? o.missing.filter((v): v is string => typeof v === "string")
    : []
  return {
    needed: Boolean(o.needed),
    ready: Boolean(o.ready),
    missing,
    binarydata: parseFirstBootBucket(o.binarydata),
    maps: parseFirstBootBucket(o.maps),
    serverdata: parseFirstBootBucket(o.serverdata),
    packages: parseFirstBootBucket(o.packages),
    overlay: parseFirstBootBucket(o.overlay),
  }
}

async function opsFetch(
  path: string,
  init?: RequestInit & { actor?: string; timeoutMs?: number }
): Promise<{ status: number; json: Record<string, unknown> }> {
  const secret = opsToken()
  if (!secret) {
    throw new Error("OPS_TOKEN is not set on the website")
  }
  const { actor, timeoutMs, ...rest } = init ?? {}
  const url = `${opsBaseUrl()}${path}`
  const signal =
    rest.signal ??
    (timeoutMs && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined)
  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
      signal,
      headers: {
        "X-Ops-Token": secret,
        Accept: "application/json",
        ...(actor ? { "X-Ops-Actor": actor } : {}),
        ...(rest.headers ?? {}),
      },
      cache: "no-store",
    })
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? `Ops sidecar unreachable (${opsBaseUrl()}): ${e.message}`
        : "Ops sidecar unreachable"
    )
  }
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    json = { ok: false, error: `HTTP ${res.status}` }
  }
  return { status: res.status, json }
}

function mapOpsActionResult(
  status: number,
  json: Record<string, unknown>
): OpsServerActionResult {
  if (status === 401) {
    return { ok: false, error: "unauthorized" }
  }
  return {
    ok: Boolean(json.ok),
    service: typeof json.service === "string" ? json.service : undefined,
    backend: typeof json.backend === "string" ? json.backend : undefined,
    message: typeof json.message === "string" ? json.message : undefined,
    detail: typeof json.detail === "string" ? json.detail : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
  }
}

export async function getOpsHealth(actor?: string): Promise<OpsHealth> {
  const { status, json } = await opsFetch("/health", { actor })
  if (status === 401) {
    return { ok: false, error: "unauthorized" }
  }
  return {
    ok: Boolean(json.ok),
    service: typeof json.service === "string" ? json.service : undefined,
    backend: typeof json.backend === "string" ? json.backend : undefined,
    verbs: Array.isArray(json.verbs)
      ? json.verbs.filter((v): v is string => typeof v === "string")
      : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
    channelStale: Boolean(json.channelStale),
    lastContentChangeAt:
      typeof json.lastContentChangeAt === "string"
        ? json.lastContentChangeAt
        : null,
    lastContentKinds: Array.isArray(json.lastContentKinds)
      ? json.lastContentKinds.filter((v): v is string => typeof v === "string")
      : [],
    lastContentSource:
      typeof json.lastContentSource === "string"
        ? json.lastContentSource
        : null,
    lastChannelRestartAt:
      typeof json.lastChannelRestartAt === "string"
        ? json.lastChannelRestartAt
        : null,
    overlayStale: Boolean(json.overlayStale),
    lastOverlayChangeAt:
      typeof json.lastOverlayChangeAt === "string"
        ? json.lastOverlayChangeAt
        : null,
    lastOverlayRehashAt:
      typeof json.lastOverlayRehashAt === "string"
        ? json.lastOverlayRehashAt
        : null,
    lastOverlaySource:
      typeof json.lastOverlaySource === "string"
        ? json.lastOverlaySource
        : null,
    firstBoot: parseFirstBoot(json.firstBoot),
  }
}

function parseHostMetrics(raw: unknown): OpsHostMetrics | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const o = raw as Record<string, unknown>
  return {
    cpuPercent: typeof o.cpuPercent === "number" ? o.cpuPercent : null,
    memUsedBytes: typeof o.memUsedBytes === "number" ? o.memUsedBytes : null,
    memTotalBytes: typeof o.memTotalBytes === "number" ? o.memTotalBytes : null,
    memAvailableBytes:
      typeof o.memAvailableBytes === "number" ? o.memAvailableBytes : null,
  }
}

function parseProcessMetrics(raw: unknown): OpsProcessMetric[] {
  if (!Array.isArray(raw)) return []
  const out: OpsProcessMetric[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    if (typeof o.name !== "string") continue
    out.push({
      name: o.name,
      running: Boolean(o.running),
      pid: typeof o.pid === "number" ? o.pid : null,
      rssBytes: typeof o.rssBytes === "number" ? o.rssBytes : null,
      cpuPercent: typeof o.cpuPercent === "number" ? o.cpuPercent : null,
      container: typeof o.container === "string" ? o.container : undefined,
      status: typeof o.status === "string" ? o.status : undefined,
      error: typeof o.error === "string" ? o.error : undefined,
      logSummary: typeof o.logSummary === "string" ? o.logSummary : undefined,
    })
  }
  return out
}

export async function getOpsMetrics(actor?: string): Promise<OpsMetrics> {
  const { status, json } = await opsFetch("/metrics", { actor })
  if (status === 401) {
    return { ok: false, error: "unauthorized" }
  }
  return {
    ok: Boolean(json.ok),
    service: typeof json.service === "string" ? json.service : undefined,
    backend: typeof json.backend === "string" ? json.backend : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
    host: parseHostMetrics(json.host),
    processes: parseProcessMetrics(json.processes),
  }
}

export type OpsServiceLogs = {
  ok: boolean
  service?: string
  summary?: string
  text?: string
  lineCount?: number
  error?: string
  detail?: string
  sources?: Array<{ path: string; exists: boolean; lines: number }>
}

export async function getOpsServiceLogs(
  service: "lobby" | "world" | "channel",
  options?: { lines?: number; actor?: string }
): Promise<OpsServiceLogs> {
  const lines = options?.lines ?? 100
  const { status, json } = await opsFetch(
    `/logs?service=${encodeURIComponent(service)}&lines=${lines}`,
    { actor: options?.actor }
  )
  if (status === 401) {
    return { ok: false, error: "unauthorized" }
  }
  return {
    ok: Boolean(json.ok),
    service: typeof json.service === "string" ? json.service : service,
    summary: typeof json.summary === "string" ? json.summary : undefined,
    text: typeof json.text === "string" ? json.text : undefined,
    lineCount: typeof json.lineCount === "number" ? json.lineCount : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
    detail: typeof json.detail === "string" ? json.detail : undefined,
    sources: Array.isArray(json.sources)
      ? (json.sources as OpsServiceLogs["sources"])
      : undefined,
  }
}

export async function restartOpsChannel(
  actor?: string
): Promise<OpsRestartChannelResult> {
  const { status, json } = await opsFetch("/restart/channel", {
    method: "POST",
    actor,
    timeoutMs: 120_000,
  })
  if (status === 401) {
    return { ok: false, error: "unauthorized" }
  }
  return {
    ok: Boolean(json.ok),
    service: typeof json.service === "string" ? json.service : undefined,
    backend: typeof json.backend === "string" ? json.backend : undefined,
    message: typeof json.message === "string" ? json.message : undefined,
    detail: typeof json.detail === "string" ? json.detail : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
  }
}

export type OpsLaneAConfigPublishResult = {
  ok: boolean
  lane?: string
  backend?: string
  message?: string
  detail?: string
  error?: string
  phase?: string
  releaseId?: string
  restarted?: boolean
  filesCopied?: number
  files?: string[]
  restart?: string[]
  warnings?: string[]
  errors?: string[]
  restartError?: string
  configDest?: string
}

function mapOpsLaneAConfigResult(
  status: number,
  json: Record<string, unknown>
): OpsLaneAConfigPublishResult {
  if (status === 401) {
    return { ok: false, error: "unauthorized" }
  }
  return {
    ok: Boolean(json.ok),
    lane: typeof json.lane === "string" ? json.lane : undefined,
    backend: typeof json.backend === "string" ? json.backend : undefined,
    message: typeof json.message === "string" ? json.message : undefined,
    detail: typeof json.detail === "string" ? json.detail : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
    phase: typeof json.phase === "string" ? json.phase : undefined,
    releaseId:
      typeof json.releaseId === "string" ? json.releaseId : undefined,
    restarted:
      typeof json.restarted === "boolean" ? json.restarted : undefined,
    filesCopied:
      typeof json.filesCopied === "number" ? json.filesCopied : undefined,
    files: Array.isArray(json.files)
      ? json.files.filter((v): v is string => typeof v === "string")
      : undefined,
    restart: Array.isArray(json.restart)
      ? json.restart.filter((v): v is string => typeof v === "string")
      : undefined,
    warnings: Array.isArray(json.warnings)
      ? json.warnings.filter((v): v is string => typeof v === "string")
      : undefined,
    errors: Array.isArray(json.errors)
      ? json.errors.filter((v): v is string => typeof v === "string")
      : undefined,
    restartError:
      typeof json.restartError === "string" ? json.restartError : undefined,
    configDest:
      typeof json.configDest === "string" ? json.configDest : undefined,
  }
}

export async function validateOpsLaneAConfig(
  actor?: string,
  options?: { only?: string[] }
): Promise<OpsLaneAConfigPublishResult> {
  const { status, json } = await opsFetch("/publish/lane-a-config/validate", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ only: options?.only }),
  })
  return mapOpsLaneAConfigResult(status, json)
}

export async function applyOpsLaneAConfig(
  releaseId: string,
  actor?: string,
  options?: { restart?: boolean }
): Promise<OpsLaneAConfigPublishResult> {
  const { status, json } = await opsFetch("/publish/lane-a-config/apply", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      releaseId,
      restart: options?.restart ?? true,
    }),
  })
  return mapOpsLaneAConfigResult(status, json)
}

export async function rollbackOpsLaneAConfig(
  actor?: string,
  options?: { releaseId?: string; restart?: boolean }
): Promise<OpsLaneAConfigPublishResult> {
  const { status, json } = await opsFetch("/publish/lane-a-config/rollback", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      releaseId: options?.releaseId,
      restart: options?.restart ?? true,
    }),
  })
  return mapOpsLaneAConfigResult(status, json)
}

export async function restartOpsServices(
  services: string[],
  actor?: string
): Promise<OpsServerActionResult & { services?: string[] }> {
  const { status, json } = await opsFetch("/restart/services", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ services }),
  })
  const base = mapOpsActionResult(status, json)
  return {
    ...base,
    services: Array.isArray(json.services)
      ? json.services.filter((v): v is string => typeof v === "string")
      : undefined,
  }
}

export async function startOpsServices(
  services: string[],
  actor?: string
): Promise<OpsServerActionResult & { services?: string[] }> {
  const { status, json } = await opsFetch("/start/services", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ services }),
    timeoutMs: 180_000,
  })
  const base = mapOpsActionResult(status, json)
  return {
    ...base,
    services: Array.isArray(json.services)
      ? json.services.filter((v): v is string => typeof v === "string")
      : undefined,
  }
}

export async function stopOpsServices(
  services: string[],
  actor?: string
): Promise<OpsServerActionResult & { services?: string[] }> {
  const { status, json } = await opsFetch("/stop/services", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ services }),
    timeoutMs: 120_000,
  })
  const base = mapOpsActionResult(status, json)
  return {
    ...base,
    services: Array.isArray(json.services)
      ? json.services.filter((v): v is string => typeof v === "string")
      : undefined,
  }
}

export async function startOpsServers(
  actor?: string
): Promise<OpsServerActionResult> {
  const { status, json } = await opsFetch("/start", {
    method: "POST",
    actor,
    // Compose waits on lobby→world→channel healthchecks (often >10s).
    timeoutMs: 180_000,
  })
  return mapOpsActionResult(status, json)
}

export async function stopOpsServers(
  actor?: string
): Promise<OpsServerActionResult> {
  const { status, json } = await opsFetch("/stop", {
    method: "POST",
    actor,
    timeoutMs: 120_000,
  })
  return mapOpsActionResult(status, json)
}

export async function publishOpsLaneA(
  actor?: string,
  options?: { restart?: boolean }
): Promise<OpsLaneAPublishResult> {
  const { status, json } = await opsFetch("/publish/lane-a", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restart: options?.restart ?? true }),
  })
  return mapOpsLaneAResult(status, json)
}

export async function publishOpsLaneB(
  actor?: string
): Promise<OpsServerActionResult> {
  const { status, json } = await opsFetch("/publish/lane-b", {
    method: "POST",
    actor,
  })
  return mapOpsActionResult(status, json)
}

export type OpsLaneCPublishResult = {
  ok: boolean
  lane?: string
  backend?: string
  message?: string
  detail?: string
  error?: string
  services?: string[]
  includeWebsite?: boolean
}

export async function publishOpsLaneC(
  actor?: string,
  options?: { confirm?: boolean; includeWebsite?: boolean }
): Promise<OpsLaneCPublishResult> {
  const { status, json } = await opsFetch("/publish/lane-c", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirm: options?.confirm ?? true,
      includeWebsite: options?.includeWebsite ?? false,
    }),
  })
  if (status === 401) {
    return { ok: false, error: "unauthorized" }
  }
  if (status === 404) {
    return { ok: false, error: "not_allowed" }
  }
  return {
    ok: Boolean(json.ok),
    lane: typeof json.lane === "string" ? json.lane : undefined,
    backend: typeof json.backend === "string" ? json.backend : undefined,
    message: typeof json.message === "string" ? json.message : undefined,
    detail: typeof json.detail === "string" ? json.detail : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
    services: Array.isArray(json.services)
      ? json.services.filter((v): v is string => typeof v === "string")
      : undefined,
    includeWebsite:
      typeof json.includeWebsite === "boolean"
        ? json.includeWebsite
        : undefined,
  }
}

export async function validateOpsLaneA(
  actor?: string
): Promise<OpsLaneAPublishResult> {
  const { status, json } = await opsFetch("/publish/lane-a/validate", {
    method: "POST",
    actor,
  })
  return mapOpsLaneAResult(status, json)
}

export async function applyOpsLaneA(
  releaseId: string,
  actor?: string,
  options?: { restart?: boolean }
): Promise<OpsLaneAPublishResult> {
  const { status, json } = await opsFetch("/publish/lane-a/apply", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      releaseId,
      restart: options?.restart ?? true,
    }),
  })
  return mapOpsLaneAResult(status, json)
}

export async function rollbackOpsLaneA(
  actor?: string,
  options?: { releaseId?: string; restart?: boolean }
): Promise<OpsLaneAPublishResult> {
  const { status, json } = await opsFetch("/publish/lane-a/rollback", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      releaseId: options?.releaseId,
      restart: options?.restart ?? true,
    }),
  })
  return mapOpsLaneAResult(status, json)
}

export type OpsIngestKind =
  | "binarydata"
  | "maps"
  | "packages"
  | "overlay"
  | "content"
  | "release"

export type OpsIngestMode = "merge" | "replace"

export type OpsIngestResult = {
  ok: boolean
  accepted?: boolean
  jobId?: string
  phase?: string
  kind?: string
  mode?: string
  message?: string
  detail?: string
  error?: string
  releaseId?: string
  files?: number
  filesRemoved?: number
  bytesWritten?: number
  bytesUploaded?: number
  destinations?: string[]
  warnings?: string[]
  requiresChannelRestart?: boolean
  channelStale?: boolean
  firstBoot?: OpsFirstBoot
  logs?: { at?: string; msg: string }[]
}

export type OpsIngestJob = {
  ok: boolean
  jobId?: string
  phase?: string
  kind?: string
  mode?: string
  bytesExpected?: number
  bytesUploaded?: number
  filesDone?: number
  filesTotal?: number
  logs: { at?: string; msg: string }[]
  error?: string | null
  finished?: boolean
  result?: OpsIngestResult | null
}

/** Forward a zip blob/buffer to the sidecar (not multipart). Returns 202+jobId. */
export async function ingestOpsZip(
  kind: OpsIngestKind,
  body: Blob | ArrayBuffer | Uint8Array,
  actor?: string,
  mode: OpsIngestMode = "merge",
  options?: { rehash?: boolean }
): Promise<OpsIngestResult> {
  const secret = opsToken()
  if (!secret) {
    throw new Error("OPS_TOKEN is not set on the website")
  }
  const size =
    body instanceof Blob
      ? body.size
      : body instanceof ArrayBuffer
        ? body.byteLength
        : body.byteLength
  const url =
    `${opsBaseUrl()}/ingest/zip?kind=${encodeURIComponent(kind)}` +
    `&mode=${encodeURIComponent(mode)}` +
    (options?.rehash === false ? "&rehash=0" : "&rehash=1")
  // Node/DOM typings disagree on Uint8Array vs BodyInit; Buffer is accepted at runtime.
  const fetchBody = (
    body instanceof Blob
      ? body
      : Buffer.from(
          body instanceof Uint8Array ? body : new Uint8Array(body)
        )
  ) as BodyInit
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Ops-Token": secret,
        Accept: "application/json",
        "Content-Type": "application/zip",
        "Content-Length": String(size),
        ...(actor ? { "X-Ops-Actor": actor } : {}),
      },
      body: fetchBody,
      cache: "no-store",
    })
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? `Ops sidecar unreachable (${opsBaseUrl()}): ${e.message}`
        : "Ops sidecar unreachable"
    )
  }
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    json = { ok: false, error: `HTTP ${res.status}` }
  }
  if (res.status === 401) {
    return { ok: false, error: "unauthorized" }
  }
  return {
    ok: Boolean(json.ok) || res.status === 202,
    accepted: Boolean(json.accepted) || res.status === 202,
    jobId: typeof json.jobId === "string" ? json.jobId : undefined,
    phase: typeof json.phase === "string" ? json.phase : undefined,
    kind: typeof json.kind === "string" ? json.kind : kind,
    mode: typeof json.mode === "string" ? json.mode : mode,
    message: typeof json.message === "string" ? json.message : undefined,
    detail: typeof json.detail === "string" ? json.detail : undefined,
    error: typeof json.error === "string" ? json.error : undefined,
    releaseId:
      typeof json.releaseId === "string" ? json.releaseId : undefined,
    files: typeof json.files === "number" ? json.files : undefined,
    filesRemoved:
      typeof json.filesRemoved === "number" ? json.filesRemoved : undefined,
    bytesWritten:
      typeof json.bytesWritten === "number" ? json.bytesWritten : undefined,
    bytesUploaded:
      typeof json.bytesUploaded === "number" ? json.bytesUploaded : undefined,
    destinations: Array.isArray(json.destinations)
      ? json.destinations.filter((v): v is string => typeof v === "string")
      : undefined,
    warnings: Array.isArray(json.warnings)
      ? json.warnings.filter((v): v is string => typeof v === "string")
      : undefined,
    requiresChannelRestart: Boolean(json.requiresChannelRestart),
    channelStale: Boolean(json.channelStale),
    firstBoot: parseFirstBoot(json.firstBoot),
  }
}

export async function getOpsIngestJob(
  jobId: string,
  actor?: string
): Promise<OpsIngestJob> {
  const { status, json } = await opsFetch(
    `/ingest/job?id=${encodeURIComponent(jobId)}`,
    { actor }
  )
  const logsRaw = Array.isArray(json.logs) ? json.logs : []
  const logs = logsRaw
    .map((row) => {
      if (!row || typeof row !== "object") return null
      const o = row as Record<string, unknown>
      if (typeof o.msg !== "string") return null
      const entry: { at?: string; msg: string } = { msg: o.msg }
      if (typeof o.at === "string") entry.at = o.at
      return entry
    })
    .filter((v): v is { at?: string; msg: string } => v != null)
  if (status === 401) {
    return { ok: false, error: "unauthorized", logs: [] }
  }
  if (status === 404) {
    return { ok: false, error: "unknown_job", logs: [] }
  }
  return {
    ok: Boolean(json.ok),
    jobId: typeof json.jobId === "string" ? json.jobId : jobId,
    phase: typeof json.phase === "string" ? json.phase : undefined,
    kind: typeof json.kind === "string" ? json.kind : undefined,
    mode: typeof json.mode === "string" ? json.mode : undefined,
    bytesExpected:
      typeof json.bytesExpected === "number" ? json.bytesExpected : undefined,
    bytesUploaded:
      typeof json.bytesUploaded === "number" ? json.bytesUploaded : undefined,
    filesDone: typeof json.filesDone === "number" ? json.filesDone : undefined,
    filesTotal:
      typeof json.filesTotal === "number" ? json.filesTotal : undefined,
    logs,
    error: typeof json.error === "string" ? json.error : null,
    finished: Boolean(json.finished),
    result:
      json.result && typeof json.result === "object"
        ? (json.result as OpsIngestResult)
        : null,
  }
}

/** Encrypt plaintext webaccess.dat via sidecar → base64 ciphertext. */
export async function encryptWebaccessViaSidecar(
  plaintext: string,
  actor?: string
): Promise<string> {
  const { status, json } = await opsFetch("/tools/webaccess-encrypt", {
    method: "POST",
    actor,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plaintext }),
  })
  if (status === 401) {
    throw new Error("Ops sidecar unauthorized")
  }
  if (!json.ok || typeof json.encryptedBase64 !== "string") {
    const detail =
      typeof json.detail === "string"
        ? json.detail
        : typeof json.error === "string"
          ? json.error
          : `HTTP ${status}`
    throw new Error(`webaccess encrypt failed: ${detail}`)
  }
  return json.encryptedBase64
}

/** Merge custom CEventMessage rows into updater overlay + rehash. */
export async function upsertCeventMessagesViaSidecar(
  messages: Array<{ id: number; lines: string[] }>,
  actor?: string
): Promise<{ ok: boolean; detail?: string; updated?: number }> {
  if (!messages.length) return { ok: true, updated: 0 }
  const { status, json } = await opsFetch("/client/ceventmessage/upsert", {
    method: "POST",
    actor,
    timeoutMs: 600_000,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, rehash: true }),
  })
  if (status === 401) {
    return { ok: false, detail: "Ops sidecar unauthorized" }
  }
  if (!json.ok) {
    const detail =
      typeof json.detail === "string"
        ? json.detail
        : typeof json.error === "string"
          ? json.error
          : `HTTP ${status}`
    return { ok: false, detail }
  }
  return {
    ok: true,
    detail: typeof json.message === "string" ? json.message : undefined,
    updated: typeof json.updated === "number" ? json.updated : messages.length,
  }
}
