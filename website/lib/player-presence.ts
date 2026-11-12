/**
 * Public player presence: lobby online count and
 * offline ≈ enabled accounts − online.
 */
import {
  adminGetOnline,
  authenticate,
} from "@/lib/comp-api"
import {
  countEnabledPlayerAccounts,
  LobbyDbMissingError,
} from "@/lib/lobby-db"

export type PlayerPresence = {
  /** In-world players (lobby online total). */
  online: number | null
  /** Enabled accounts not currently in-world. */
  offline: number | null
  /** Enabled player accounts. */
  accounts: number | null
  error?: string
}

const CACHE_TTL_MS = 15_000

let cache: { at: number; value: PlayerPresence } | null = null

function getServiceCredentials(): { user: string; password: string } | null {
  const user = process.env.COMP_ANNOUNCE_USER?.trim()
  const password = process.env.COMP_ANNOUNCE_PASSWORD
  if (!user || password == null || password === "") return null
  return { user, password }
}

export function offlineFromAccounts(
  accounts: number,
  online: number
): number {
  return Math.max(0, accounts - online)
}

async function fetchOnlineRaw(): Promise<
  { total: number } | { error: string }
> {
  const creds = getServiceCredentials()
  if (!creds) {
    return {
      error:
        "COMP_ANNOUNCE_USER / COMP_ANNOUNCE_PASSWORD not configured",
    }
  }
  try {
    const auth = await authenticate(creds.user, creds.password, {
      timeoutMs: 4_000,
    })
    const online = await adminGetOnline(auth)
    return { total: online.total }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "lobby online failed",
    }
  }
}

async function collectPlayerPresenceUncached(): Promise<PlayerPresence> {
  let accounts: number | null = null
  let accountsError: string | undefined
  try {
    accounts = countEnabledPlayerAccounts()
  } catch (error) {
    accountsError =
      error instanceof LobbyDbMissingError
        ? "lobby database unavailable"
        : error instanceof Error
          ? error.message
          : "account census failed"
  }

  const onlineResult = await fetchOnlineRaw()

  if ("error" in onlineResult) {
    return {
      online: null,
      offline: null,
      accounts,
      error: [onlineResult.error, accountsError].filter(Boolean).join("; "),
    }
  }

  const online = onlineResult.total
  const offline =
    accounts != null ? offlineFromAccounts(accounts, online) : null

  return {
    online,
    offline,
    accounts,
    error: accountsError,
  }
}

/** Cached collector for public status / home widgets. */
export async function collectPlayerPresence(): Promise<PlayerPresence> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.value
  }
  const value = await collectPlayerPresenceUncached()
  cache = { at: now, value }
  return value
}

/** Test helper — drop presence cache. */
export function resetPlayerPresenceCache(): void {
  cache = null
}
