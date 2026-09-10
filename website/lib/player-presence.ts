/**
 * Public player presence: real online count (minus studio mannequins) and
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
import { getStudioHealth } from "@/lib/studio-api"

export type PlayerPresence = {
  /** In-world players after subtracting vam/vaf mannequins when known. */
  online: number | null
  /** Enabled accounts not currently in-world. */
  offline: number | null
  /** Enabled non-mannequin accounts. */
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

/** Same mannequin subtraction as AdminOpsMetrics “real players”. */
export function realOnlineCount(
  lobbyTotal: number,
  mannequinOnline: number
): number {
  return Math.max(0, lobbyTotal - Math.max(0, mannequinOnline))
}

export function offlineFromAccounts(
  accounts: number,
  online: number
): number {
  return Math.max(0, accounts - online)
}

async function countMannequinsOnline(): Promise<number> {
  try {
    const health = await getStudioHealth()
    if (!(health.ok || health.vam1 || health.vaf1 || health.vam || health.vaf)) {
      return 0
    }
    let n = 0
    if (health.vam1 || health.vam) n += 1
    if (health.vaf1 || health.vaf) n += 1
    return n
  } catch {
    return 0
  }
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
    const auth = await authenticate(creds.user, creds.password)
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

  const [onlineResult, mannequinOnline] = await Promise.all([
    fetchOnlineRaw(),
    countMannequinsOnline(),
  ])

  if ("error" in onlineResult) {
    return {
      online: null,
      offline: null,
      accounts,
      error: [onlineResult.error, accountsError].filter(Boolean).join("; "),
    }
  }

  const online = realOnlineCount(onlineResult.total, mannequinOnline)
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
