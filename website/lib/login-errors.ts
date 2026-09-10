import { CompApiError } from "@/lib/comp-api"

export type ClassifiedApiFail = {
  message: string
  statusCode: number
  error: string
}

/** Lobby answered over HTTP — do not fall back to Account SQLite. */
export function isCompUnreachable(error: unknown): boolean {
  return !(error instanceof CompApiError)
}

/** Shown when COMP is down and offline admin verify also fails. */
export const LOBBY_DOWN_LOGIN_MESSAGE =
  "Login service (lobby) is down. Admins can sign in with their usual password once the account database is available."

/**
 * Map COMP / network failures from the login route to BFF responses.
 *
 * Lobby quirk: `/auth/get_challenge` returns **400** when the account is
 * missing or disabled (handler returns false → generic Bad Request). Wrong
 * password fails later on `/account/get_details` with **401**. Both are
 * client auth failures — never 5xx, or TanStack will retry.
 */
export function classifyLoginError(error: unknown): ClassifiedApiFail {
  if (error instanceof CompApiError) {
    if (error.status === 400 || error.status === 401) {
      return {
        message: "Invalid username or password",
        statusCode: 401,
        error: "UNAUTHORIZED",
      }
    }
    return {
      message: error.message,
      statusCode: error.status >= 500 ? 502 : error.status,
      error: "COMP",
    }
  }

  if (isCompUnreachable(error)) {
    return {
      message: LOBBY_DOWN_LOGIN_MESSAGE,
      statusCode: 502,
      error: "COMP",
    }
  }

  return {
    message: error instanceof Error ? error.message : "Login failed",
    statusCode: 502,
    error: "COMP",
  }
}
