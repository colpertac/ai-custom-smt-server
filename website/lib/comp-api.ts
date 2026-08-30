import { placeholderEmail, isPlaceholderEmail } from "@/lib/email/placeholders"
import { getCompApiUrl, getCompResetSecret } from "@/lib/env"
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
 */
export async function authenticatedRequest(
  auth: CompAuthState,
  path: string,
  body: JsonObject = {}
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
    banReason: String(data.ban_reason ?? ""),
    banInitiator: String(data.ban_initiator ?? ""),
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

  const username = input.username?.trim().toLowerCase() || ""
  const email = input.email?.trim().toLowerCase() || ""
  if (!username && !email) return null

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
