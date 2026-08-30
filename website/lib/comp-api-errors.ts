/** Default world when the client omits worldId (single-world installs). */
export const DEFAULT_WORLD_ID = 0

export function compApiFailMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: number }).status === 401
  ) {
    return "COMP session expired (often after lobby restart). Sign out and sign back in."
  }
  return error instanceof Error ? error.message : fallback
}
