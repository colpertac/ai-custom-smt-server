import { logout } from "@/features/auth/api"

export const LOBBY_RESTART_LOGIN_PARAM = "lobbyRestarted"

/** Lobby restart wipes server-side challenge state; cookie still looks signed in. */
export async function signOutAfterLobbyRestart(): Promise<void> {
  try {
    await logout()
  } catch {
    /* still redirect — stale cookie is cleared server-side when possible */
  }
  window.location.assign(`/login?${LOBBY_RESTART_LOGIN_PARAM}=1`)
}
