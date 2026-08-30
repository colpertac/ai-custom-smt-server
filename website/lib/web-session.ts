import { readSession, updateSession, type WebSession } from "@/lib/session"

/** Load sealed cookie session for authenticated COMP calls. */
export async function requireWebSession(): Promise<WebSession | null> {
  return readSession()
}

export async function persistWebSession(session: WebSession): Promise<void> {
  await updateSession(session)
}
