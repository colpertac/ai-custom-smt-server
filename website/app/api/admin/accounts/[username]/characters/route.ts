import {
  listCharactersByUsername,
  LobbyDbMissingError,
  WorldDbMissingError,
} from "@/lib/admin-characters"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { persistWebSession, requireWebSession } from "@/lib/web-session"

type Params = { params: Promise<{ username: string }> }

export async function GET(_request: Request, { params }: Params) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const username = decodeURIComponent((await params).username ?? "")
    .trim()
    .toLowerCase()
  if (!username || username.length > 32) {
    return apiFail("Invalid username", 400, "VALIDATION")
  }

  try {
    const characters = listCharactersByUsername(username)
    if (characters == null) {
      return apiFail("Account not found", 404, "NOT_FOUND")
    }
    await persistWebSession(session)
    return apiOk({ username, characters })
  } catch (error) {
    if (
      error instanceof WorldDbMissingError ||
      error instanceof LobbyDbMissingError
    ) {
      return apiFail(error.message, 503, "DB")
    }
    return apiFail(
      error instanceof Error ? error.message : "Character list failed",
      500,
      "ADMIN"
    )
  }
}
