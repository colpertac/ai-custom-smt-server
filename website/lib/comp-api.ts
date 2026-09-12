import { placeholderEmail, isPlaceholderEmail } from "@/lib/email/placeholders"
import { getCompApiUrl, getCompResetSecret } from "@/lib/env"
import { lookupUsernameByEmail } from "@/lib/lobby-db"
import { challengeReply, passwordHash } from "@/lib/sha512"

export class CompApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message)
    this.name = "CompApiError"
  }
}

type JsonObject = Record<string, unknown>

async function postJson(path: string, body: JsonObject): Promise<JsonObject> {
  const url = `${getCompApiUrl()}/api${path}`
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })

  const text = await response.text()
  let data: JsonObject = {}
  if (text) {
    try {
      data = JSON.parse(text) as JsonObject
    } catch {
      throw new CompApiError(
        `COMP API returned non-JSON (${response.status})`,
        response.status,
        text
      )
    }
  }

  if (!response.ok) {
    throw new CompApiError(
      `COMP API ${path} failed (${response.status})`,
      response.status,
      data
    )
  }

  return data
}

export type CompChallenge = {
  salt: string
  challenge: string
}

export async function getChallenge(username: string): Promise<CompChallenge> {
  const data = await postJson("/auth/get_challenge", {
    username: username.toLowerCase(),
  })

  const salt = typeof data.salt === "string" ? data.salt : ""
  const challenge = typeof data.challenge === "string" ? data.challenge : ""
  if (!salt || !challenge) {
    throw new CompApiError("Malformed get_challenge response", 500, data)
  }

  return { salt, challenge }
}

export type CompAuthState = {
  username: string
  passwordHash: string
  /** Next challenge *reply* to send (SHA-512 hex). */
  challenge: string
}

export async function authenticate(
  username: string,
  password: string
): Promise<CompAuthState> {
  const normalized = username.toLowerCase()
  const { salt, challenge } = await getChallenge(normalized)
  const hash = passwordHash(password, salt)
  const reply = challengeReply(hash, challenge)

  return {
    username: normalized,
    passwordHash: hash,
    challenge: reply,
  }
}

/**
 * Authenticated COMP call. Rotates `auth.challenge` from the response.
 * On 401, re-mints a challenge once (lobby restart / HMR / stale cookie).
 */
export async function authenticatedRequest(
  auth: CompAuthState,
  path: string,
  body: JsonObject = {}
): Promise<JsonObject> {
  try {
    return await authenticatedRequestOnce(auth, path, body)
  } catch (error) {
    if (!(error instanceof CompApiError) || error.status !== 401) {
      throw error
    }
    const { challenge } = await getChallenge(auth.username)
    auth.challenge = challengeReply(auth.passwordHash, challenge)
    return authenticatedRequestOnce(auth, path, body)
  }
}

async function authenticatedRequestOnce(
  auth: CompAuthState,
  path: string,
  body: JsonObject
): Promise<JsonObject> {
  const data = await postJson(path, {
    ...body,
    session_username: auth.username,
    challenge: auth.challenge,
  })

  const nextChallenge =
    typeof data.challenge === "string" ? data.challenge : ""
  if (!nextChallenge) {
    throw new CompApiError("Authenticated response missing challenge", 500, data)
  }

  auth.challenge = challengeReply(auth.passwordHash, nextChallenge)
  return data
}

export type AccountDetails = {
  username: string
  dispName: string
  email: string
  cp: number
  ticketCount: number
  userLevel: number
  enabled: boolean
  lastLogin: number
  characterCount: number
  banReason: string
  banInitiator: string
}

export function parseAccountDetails(data: JsonObject): AccountDetails {
  const username = String(data.username ?? "")
  const rawEmail = String(data.email ?? "")
  return {
    username,
    dispName: String(data.disp_name ?? ""),
    email: rawEmail,
    cp: Number(data.cp ?? 0),
    ticketCount: Number(data.ticket_count ?? 0),
    userLevel: Number(data.user_level ?? 0),
    enabled: Boolean(data.enabled),
    lastLogin: Number(data.last_login ?? 0),
    characterCount: Number(data.character_count ?? 0),
    banReason: String(data.ban_reason ?? "").replace(/\u200b/g, ""),
    banInitiator: String(data.ban_initiator ?? "").replace(/\u200b/g, ""),
  }
}

export async function registerAccount(input: {
  username: string
  email?: string
  password: string
}): Promise<{ error: string }> {
  const username = input.username.toLowerCase()
  const email =
    (input.email ?? "").trim().toLowerCase() || placeholderEmail(username)

  const data = await postJson("/account/register", {
    username,
    email,
    password: input.password,
  })

  return { error: String(data.error ?? "Unknown error") }
}

export async function changePassword(
  auth: CompAuthState,
  password: string
): Promise<{ error: string }> {
  const data = await authenticatedRequest(auth, "/account/change_password", {
    password,
  })
  return { error: String(data.error ?? "Unknown error") }
}

export async function changeDisplayName(
  auth: CompAuthState,
  dispName: string
): Promise<{ error: string }> {
  const data = await authenticatedRequest(
    auth,
    "/account/change_display_name",
    { disp_name: dispName }
  )
  return { error: String(data.error ?? "Unknown error") }
}

export async function changeEmail(
  auth: CompAuthState,
  email: string
): Promise<{ error: string }> {
  const data = await authenticatedRequest(auth, "/account/change_email", {
    email,
  })
  return { error: String(data.error ?? "Unknown error") }
}

export type AdminAccountRow = AccountDetails

export async function adminGetAccounts(
  auth: CompAuthState
): Promise<AdminAccountRow[]> {
  const data = await authenticatedRequest(auth, "/admin/get_accounts")
  const accounts = Array.isArray(data.accounts) ? data.accounts : []
  return accounts.map((row) =>
    parseAccountDetails((row ?? {}) as JsonObject)
  )
}

export type AdminOnlineWorldCount = {
  worldId: number
  characterCount: number
}

export type AdminOnlineCounts = {
  total: number
  worlds: AdminOnlineWorldCount[]
}

/** Lobby `/admin/online` with no targets → aggregate character counts. */
export async function adminGetOnline(
  auth: CompAuthState
): Promise<AdminOnlineCounts> {
  const data = await authenticatedRequest(auth, "/admin/online")
  if (data.error && data.error !== "Success") {
    throw new CompApiError(String(data.error), 502, data)
  }
  const worldsRaw = Array.isArray(data.counts) ? data.counts : []
  const worlds: AdminOnlineWorldCount[] = []
  for (const row of worldsRaw) {
    if (!row || typeof row !== "object") continue
    const o = row as JsonObject
    worlds.push({
      worldId: Number(o.world_id ?? 0),
      characterCount: Number(o.character_count ?? 0),
    })
  }
  return {
    total: Number(data.total ?? 0),
    worlds,
  }
}

/**
 * Lobby `/admin/message_world` — world-wide ticker or console chat.
 * Ticker `mode` matches in-game `@announce` color (0–4).
 */
export async function adminMessageWorld(
  auth: CompAuthState,
  payload: {
    worldId: number
    message: string
    type: "ticker" | "console"
    mode?: number
    subMode?: number
    from?: string
  }
): Promise<{ error: string }> {
  const body: JsonObject = {
    world_id: payload.worldId,
    message: payload.message,
    type: payload.type,
  }
  if (payload.type === "ticker") {
    if (payload.mode !== undefined) body.mode = payload.mode
    if (payload.subMode !== undefined) body.sub_mode = payload.subMode
  } else if (payload.from !== undefined) {
    body.from = payload.from
  }
  const data = await authenticatedRequest(auth, "/admin/message_world", body)
  return { error: String(data.error ?? "Unknown error") }
}

export type AdminChatLogEntry = {
  uid: string
  characterName: string
  chatType: number
  targetName: string
  message: string
  zoneId: number
  channelId: number
  timestamp: number
}

/** Lobby `/admin/list_chat_logs` */
export async function adminListChatLogs(
  auth: CompAuthState,
  payload: {
    worldId: number
    characterName?: string
    since?: number
    until?: number
    limit?: number
  }
): Promise<AdminChatLogEntry[]> {
  const body: JsonObject = { world_id: payload.worldId }
  if (payload.characterName) body.character_name = payload.characterName
  if (payload.since !== undefined) body.since = payload.since
  if (payload.until !== undefined) body.until = payload.until
  if (payload.limit !== undefined) body.limit = payload.limit

  const data = await authenticatedRequest(auth, "/admin/list_chat_logs", body)
  if (data.error && data.error !== "Success") {
    throw new CompApiError(String(data.error), 502, data)
  }
  const raw = Array.isArray(data.logs) ? data.logs : []
  const logs: AdminChatLogEntry[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const o = row as JsonObject
    logs.push({
      uid: String(o.uid ?? ""),
      characterName: String(o.character_name ?? ""),
      chatType: Number(o.chat_type ?? 0),
      targetName: String(o.target_name ?? ""),
      message: String(o.message ?? ""),
      zoneId: Number(o.zone_id ?? 0),
      channelId: Number(o.channel_id ?? 0),
      timestamp: Number(o.timestamp ?? 0),
    })
  }
  return logs
}

export type AdminReport = {
  uid: string
  playerName: string
  location: string
  comment: string
  subject: number
  resolved: boolean
  reportTime: number
  resolveTime: number
  reporterUsername: string
  resolverUsername: string
}

/** Lobby `/admin/list_reports` */
export async function adminListReports(
  auth: CompAuthState,
  payload: {
    worldId: number
    resolved?: boolean
    playerName?: string
    limit?: number
  }
): Promise<AdminReport[]> {
  const body: JsonObject = {
    world_id: payload.worldId,
    resolved: payload.resolved ?? false,
  }
  if (payload.playerName) body.player_name = payload.playerName
  if (payload.limit !== undefined) body.limit = payload.limit

  const data = await authenticatedRequest(auth, "/admin/list_reports", body)
  if (data.error && data.error !== "Success") {
    throw new CompApiError(String(data.error), 502, data)
  }
  const raw = Array.isArray(data.reports) ? data.reports : []
  const reports: AdminReport[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const o = row as JsonObject
    reports.push({
      uid: String(o.uid ?? ""),
      playerName: String(o.player_name ?? ""),
      location: String(o.location ?? ""),
      comment: String(o.comment ?? ""),
      subject: Number(o.subject ?? 0),
      resolved: Boolean(o.resolved),
      reportTime: Number(o.report_time ?? 0),
      resolveTime: Number(o.resolve_time ?? 0),
      reporterUsername: String(o.reporter_username ?? ""),
      resolverUsername: String(o.resolver_username ?? ""),
    })
  }
  return reports
}

/** Lobby `/admin/resolve_report` */
export async function adminResolveReport(
  auth: CompAuthState,
  payload: { worldId: number; uid: string }
): Promise<{ error: string }> {
  const data = await authenticatedRequest(auth, "/admin/resolve_report", {
    world_id: payload.worldId,
    uid: payload.uid,
  })
  return { error: String(data.error ?? "Unknown error") }
}

export type PromoLimitType = "character" | "world" | "account"

export type AdminPromo = {
  code: string
  startTime: number
  endTime: number
  useLimit: number
  limitType: PromoLimitType
  items: number[]
}

function parsePromoLimitType(raw: unknown): PromoLimitType {
  const s = String(raw ?? "")
  if (s === "character" || s === "world" || s === "account") return s
  return "account"
}

/** Lobby `/admin/get_promos` — happy path returns `promos` (no `error: Success`). */
export async function adminGetPromos(
  auth: CompAuthState
): Promise<AdminPromo[]> {
  const data = await authenticatedRequest(auth, "/admin/get_promos")
  if (data.error && data.error !== "Success") {
    throw new CompApiError(String(data.error), 502, data)
  }
  const raw = Array.isArray(data.promos) ? data.promos : []
  const promos: AdminPromo[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const o = row as JsonObject
    const itemsRaw = Array.isArray(o.items) ? o.items : []
    promos.push({
      code: String(o.code ?? ""),
      startTime: Number(o.startTime ?? 0),
      endTime: Number(o.endTime ?? 0),
      useLimit: Number(o.useLimit ?? 0),
      limitType: parsePromoLimitType(o.limitType),
      items: itemsRaw.map((id) => Number(id)).filter((n) => Number.isFinite(n)),
    })
  }
  return promos
}

export function isCreatePromoSuccess(error: string): boolean {
  return (
    error === "Success" ||
    error.startsWith("Promotion with that code already exists")
  )
}

export function isDeletePromoSuccess(error: string): boolean {
  return /^Deleted \d+ promotions\.$/.test(error)
}

/** Lobby `/admin/create_promo`. */
export async function adminCreatePromo(
  auth: CompAuthState,
  payload: {
    code: string
    startTime: number
    endTime: number
    useLimit: number
    limitType: PromoLimitType
    items: number[]
  }
): Promise<{ error: string }> {
  const data = await authenticatedRequest(auth, "/admin/create_promo", {
    code: payload.code,
    startTime: payload.startTime,
    endTime: payload.endTime,
    useLimit: payload.useLimit,
    limitType: payload.limitType,
    items: payload.items,
  })
  return { error: String(data.error ?? "Unknown error") }
}

/** Lobby `/admin/delete_promo` — deletes all promos with that code. */
export async function adminDeletePromo(
  auth: CompAuthState,
  code: string
): Promise<{ error: string }> {
  const data = await authenticatedRequest(auth, "/admin/delete_promo", {
    code,
  })
  return { error: String(data.error ?? "Unknown error") }
}

/**
 * Lobby `/admin/post_items` — grant ShopProductData rows to an account mailbox,
 * optionally debiting CP atomically.
 */
export async function adminPostItems(
  auth: CompAuthState,
  payload: {
    username: string
    products: number[]
    cp?: number
  }
): Promise<{ error: string; cp?: number }> {
  const body: JsonObject = {
    username: payload.username.toLowerCase(),
    products: payload.products,
  }
  if (payload.cp != null && payload.cp > 0) {
    body.cp = payload.cp
  }
  const data = await authenticatedRequest(auth, "/admin/post_items", body)
  const error = String(data.error ?? "Unknown error")
  const cp =
    typeof data.cp === "number"
      ? data.cp
      : data.cp != null
        ? Number(data.cp)
        : undefined
  return {
    error,
    cp: Number.isFinite(cp) ? cp : undefined,
  }
}

export type CustomPostGrantItem = {
  productId: number
  basicEffect?: number
  specialEffect?: number
  tarot?: number
  soul?: number
}

/**
 * Lobby `/admin/grant_custom_items` — grant fused/enchanted PostItem rows,
 * optionally debiting CP atomically.
 */
export async function adminGrantCustomItems(
  auth: CompAuthState,
  payload: {
    username: string
    items: CustomPostGrantItem[]
    cp?: number
  }
): Promise<{ error: string; cp?: number }> {
  const body: JsonObject = {
    username: payload.username.toLowerCase(),
    items: payload.items,
  }
  if (payload.cp != null && payload.cp > 0) {
    body.cp = payload.cp
  }
  const data = await authenticatedRequest(
    auth,
    "/admin/grant_custom_items",
    body
  )
  const error = String(data.error ?? "Unknown error")
  const cp =
    typeof data.cp === "number"
      ? data.cp
      : data.cp != null
        ? Number(data.cp)
        : undefined
  return {
    error,
    cp: Number.isFinite(cp) ? cp : undefined,
  }
}

export async function adminUpdateAccount(
  auth: CompAuthState,
  payload: {
    username: string
    password?: string
    disp_name?: string
    email?: string
    cp?: number
    ticket_count?: number
    user_level?: number
    enabled?: boolean
    ban_reason?: string
    ban_initiator?: string
  }
): Promise<{ error: string }> {
  const data = await authenticatedRequest(auth, "/admin/update_account", payload)
  return { error: String(data.error ?? "Unknown error") }
}

export async function adminDeleteAccount(
  auth: CompAuthState,
  username: string
): Promise<boolean> {
  // Delete returns HTTP 200 with empty/minimal body; Authenticate still rotates challenge.
  await authenticatedRequest(auth, "/admin/delete_account", {
    username: username.toLowerCase(),
  })
  return true
}

/**
 * Website→lobby only. Requires COMP_RESET_SECRET on both sides.
 * Lookup by username or recovery email. Returns real email or "" when
 * missing/placeholder/unknown.
 */
export async function fetchRecoveryEmail(input: {
  username?: string
  email?: string
}): Promise<{ username: string; email: string } | null> {
  const secret = getCompResetSecret()
  if (!secret) {
    throw new CompApiError("COMP_RESET_SECRET not configured", 500)
  }

  const usernameIn = input.username?.trim().toLowerCase() || ""
  const email = input.email?.trim().toLowerCase() || ""
  if (!usernameIn && !email) return null

  // Lobby HTTP auth for recovery_email requires a username field. When the
  // user enters only an email, resolve username from lobby SQLite first.
  let username = usernameIn
  if (!username && email) {
    try {
      username = lookupUsernameByEmail(email) || ""
    } catch (err) {
      console.error("[forgot-password] lobby DB email lookup failed:", err)
    }
  }

  try {
    const data = await postJson("/account/recovery_email", {
      ...(username ? { username } : {}),
      ...(email ? { email } : {}),
      reset_secret: secret,
    })
    if (String(data.error ?? "") !== "Success") {
      if (String(data.error ?? "") === "Password reset disabled") {
        console.error(
          "[forgot-password] lobby COMP_RESET_SECRET is unset — restart comp_lobby with the same secret as the website (Admin → Email, or website/data/comp-reset-secret)"
        )
      }
      return null
    }
    const resolvedUsername = String(
      data.username ?? username
    ).toLowerCase()
    const resolvedEmail = String(data.email ?? "").trim()
    if (!resolvedEmail || isPlaceholderEmail(resolvedEmail, resolvedUsername)) {
      return { username: resolvedUsername, email: "" }
    }
    return { username: resolvedUsername, email: resolvedEmail }
  } catch (error) {
    if (error instanceof CompApiError && (error.status === 400 || error.status === 401)) {
      return null
    }
    // Lobby may return 200 with error Account not found — postJson only throws on !ok
    throw error
  }
}

export async function resetAccountPassword(
  username: string,
  password: string
): Promise<{ error: string }> {
  const secret = getCompResetSecret()
  if (!secret) {
    throw new CompApiError("COMP_RESET_SECRET not configured", 500)
  }

  const data = await postJson("/account/reset_password", {
    username: username.toLowerCase(),
    password,
    reset_secret: secret,
  })
  return { error: String(data.error ?? "Unknown error") }
}
