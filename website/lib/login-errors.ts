import { CompApiError } from "@/lib/comp-api"

export type ClassifiedApiFail = {
  message: string
  statusCode: number
  error: string
}

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

  return {
    message: error instanceof Error ? error.message : "Login failed",
    statusCode: 502,
    error: "COMP",
  }
}
