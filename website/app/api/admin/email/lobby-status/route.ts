import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getCompApiUrl, getCompResetSecret } from "@/lib/env"
import { requireWebSession } from "@/lib/web-session"

/** Probe lobby password-reset API (admin diagnostics). */
export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const secret = getCompResetSecret()
  if (!secret) {
    return apiOk({
      configured: false,
      lobbyReady: false,
      message: "Website reset secret not configured — save Admin → Email first.",
    })
  }

  try {
    const response = await fetch(
      `${getCompApiUrl()}/api/account/recovery_email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "__probe__",
          reset_secret: secret,
        }),
        cache: "no-store",
      }
    )
    const data = (await response.json()) as { error?: string }
    const err = String(data.error ?? "")

    if (err === "Password reset disabled") {
      return apiOk({
        configured: true,
        lobbyReady: false,
        message:
          "Lobby was started without COMP_RESET_SECRET. Restart comp_lobby (Admin → Email → Restart lobby, or comp_hack/scripts/restart-service.sh lobby).",
      })
    }

    if (err === "Unauthorized") {
      return apiOk({
        configured: true,
        lobbyReady: false,
        message:
          "Lobby reset secret does not match the website. Save Admin → Email again, then restart lobby.",
      })
    }

    // Account not found / Success — API accepted our secret.
    return apiOk({
      configured: true,
      lobbyReady: true,
      message: "Lobby password reset API is ready.",
    })
  } catch (error) {
    return apiOk({
      configured: true,
      lobbyReady: false,
      message:
        error instanceof Error
          ? `Could not reach lobby: ${error.message}`
          : "Could not reach lobby.",
    })
  }
}
