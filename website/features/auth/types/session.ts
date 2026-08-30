export type SessionUser = {
  username: string
  dispName?: string
  userLevel?: number
  email?: string
  cp?: number
  ticketCount?: number
  characterCount?: number
  enabled?: boolean
  lastLogin?: number
  banReason?: string
  banInitiator?: string
  /** True when logged in with default admin/admin123 — must change before continuing. */
  mustChangePassword?: boolean
}
