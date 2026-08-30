import { readSession, updateSession, type WebSession } from "@/lib/session"
import { withUsernameLock } from "@/lib/comp-session-lock"
import {
  forgetChallenge,
  rememberChallenge,
  resolveChallenge,
} from "@/lib/comp-challenge-store"

/** Load sealed cookie session for authenticated COMP calls. */
export async function requireWebSession(): Promise<WebSession | null> {
  return readSession()
}

export async function persistWebSession(session: WebSession): Promise<void> {
  rememberChallenge(session.username, session.challenge)
  await updateSession(session)
}

/**
 * Run a COMP-authenticated operation with exclusive challenge ownership.
 *
 * Re-reads the cookie under the lock, overlays the in-memory challenge (so
 * concurrent handlers don't all replay the same cookie value), then persists
 * both memory + cookie after the call.
 */
export async function withCompSession<T>(
  fn: (session: WebSession) => Promise<T>
): Promise<T> {
  const peek = await readSession()
  if (!peek) {
    throw new CompSessionMissingError()
  }

  return withUsernameLock(peek.username, async () => {
    const session = await readSession()
    if (!session) {
      throw new CompSessionMissingError()
    }
    session.challenge = resolveChallenge(session.username, session.challenge)
    try {
      return await fn(session)
    } finally {
      const still = await readSession()
      if (still && still.username === session.username) {
        rememberChallenge(session.username, session.challenge)
        await updateSession(session)
      } else {
        forgetChallenge(session.username)
      }
    }
  })
}

export class CompSessionMissingError extends Error {
  constructor() {
    super("Not signed in")
    this.name = "CompSessionMissingError"
  }
}
