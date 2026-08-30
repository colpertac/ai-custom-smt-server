/**
 * Serialize COMP challenge use per username.
 *
 * Lobby auth is one-shot. Concurrent BFFs all see the same *incoming* cookie
 * challenge (Set-Cookie from a sibling is invisible), so we pair this lock with
 * `comp-challenge-store` memory. The lock alone is not enough.
 */

const tails = new Map<string, Promise<unknown>>()

export async function withUsernameLock<T>(
  username: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = username.trim().toLowerCase()
  if (!key) return fn()

  const prev = tails.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const chained = prev.then(() => gate)
  tails.set(key, chained)

  await prev
  try {
    return await fn()
  } finally {
    release()
    if (tails.get(key) === chained) {
      tails.delete(key)
    }
  }
}
