/** COMP lobby admin routes require user_level >= 1000 (see docs/lobby-api.md). */
export const ADMIN_USER_LEVEL = 1000

export function isAdminLevel(userLevel: number | null | undefined): boolean {
  return (userLevel ?? 0) >= ADMIN_USER_LEVEL
}
