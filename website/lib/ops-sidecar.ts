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
  disabledPayouts?: string[]
  skippedConflicts?: string[]
  warnings?: string[]
  errors?: string[]
  restartError?: string
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
    disabledPayouts: Array.isArray(json.disabledPayouts)
      ? json.disabledPayouts.filter((v): v is string => typeof v === "string")
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
    packages: parseFirstBootBucket(o.packages),
    overlay: parseFirstBootBucket(o.overlay),
  }
}

async function opsFetch(
  path: string,
  init?: RequestInit & { actor?: string }
): Promise<{ status: number; json: Record<string, unknown> }> {
  const secret = opsToken()
  if (!secret) {
    throw new Error("OPS_TOKEN is not set on the website")
  }
  const { actor, ...rest } = init ?? {}
  const url = `${opsBaseUrl()}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
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

export async function restartOpsChannel(
  actor?: string
): Promise<OpsRestartChannelResult> {
  const { status, json } = await opsFetch("/restart/channel", {
    method: "POST",
    actor,
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

export async function startOpsServers(
  actor?: string
): Promise<OpsServerActionResult> {
  const { status, json } = await opsFetch("/start", {
    method: "POST",
    actor,
  })
  return mapOpsActionResult(status, json)
}

export async function stopOpsServers(
  actor?: string
): Promise<OpsServerActionResult> {
  const { status, json } = await opsFetch("/stop", {
    method: "POST",
    actor,
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
  const fetchBody: BodyInit =
    body instanceof Blob ? body : Buffer.from(body as ArrayBuffer | Uint8Array)
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
      return {
        at: typeof o.at === "string" ? o.at : undefined,
        msg: o.msg,
      }
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
