import { createHash } from "node:crypto"

import { EncryptJWT, jwtDecrypt } from "jose"
import { cookies } from "next/headers"

import type { CompAuthState } from "@/lib/comp-api"
import { forgetChallenge, rememberChallenge } from "@/lib/comp-challenge-store"
import { cookieSecure, getSessionSecret } from "@/lib/env"

const COOKIE_NAME = "smt_session"
const MAX_AGE_SECONDS = 60 * 60 * 12

export type WebSession = CompAuthState & {
  /** Cached display fields from last successful get_details. */
  dispName?: string
  userLevel?: number
  /** Logged in with default admin password — force change. */
  mustChangePassword?: boolean
}

/** A256GCM requires a 32-byte key; derive from the configured secret. */
function secretKey() {
  return createHash("sha256").update(getSessionSecret(), "utf8").digest()
}

export async function sealSession(session: WebSession): Promise<void> {
  rememberChallenge(session.username, session.challenge)

  const token = await new EncryptJWT({ ...session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .encrypt(secretKey())

  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // Only Secure when browsers use HTTPS (see COOKIE_SECURE / SITE_URL).
    secure: cookieSecure(),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function readSession(): Promise<WebSession | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) {
    return null
  }

  try {
    const { payload } = await jwtDecrypt(token, secretKey())
    const username = String(payload.username ?? "")
    const passwordHash = String(payload.passwordHash ?? "")
    const challenge = String(payload.challenge ?? "")
    if (!username || !passwordHash || !challenge) {
      return null
    }

    return {
      username,
      passwordHash,
      challenge,
      dispName:
        typeof payload.dispName === "string" ? payload.dispName : undefined,
      userLevel:
        typeof payload.userLevel === "number" ? payload.userLevel : undefined,
      mustChangePassword: Boolean(payload.mustChangePassword),
    }
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (token) {
    try {
      const { payload } = await jwtDecrypt(token, secretKey())
      const username = String(payload.username ?? "")
      if (username) forgetChallenge(username)
    } catch {
      /* ignore */
    }
  }
  jar.delete(COOKIE_NAME)
}

export async function updateSession(session: WebSession): Promise<void> {
  await sealSession(session)
}
