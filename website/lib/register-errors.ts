import { CompApiError } from "@/lib/comp-api"

export type ClassifiedApiFail = {
  message: string
  statusCode: number
  error: string
}

/**
 * Map register failures. Lobby may return bare HTTP 400 (empty body) when
 * email/username/password fail hard checks — surface a usable message, not
 * "COMP API /account/register failed (400)".
 */
export function classifyRegisterError(error: unknown): ClassifiedApiFail {
  if (error instanceof CompApiError) {
    if (error.status === 400 || error.status === 401) {
      return {
        message: "Could not create account. Check username, password, and email.",
        statusCode: 400,
        error: "REGISTER",
      }
    }
    return {
      message: error.message,
      statusCode: error.status >= 500 ? 502 : error.status,
      error: "COMP",
    }
  }

  return {
    message: error instanceof Error ? error.message : "Registration failed",
    statusCode: 502,
    error: "COMP",
  }
}
