/** Shared types for Admin Recovery hub. */

export type RecoverySnapshotFile = {
  path: string
  sha256: string
  bytes: number
}

export type RecoverySnapshotManifest = {
  id: string
  createdAt: string
  actor: string | null
  reason: string
  files: RecoverySnapshotFile[]
}

export type RecoverySnapshotSummary = {
  id: string
  createdAt: string
  actor: string | null
  reason: string
  fileCount: number
}

export type RecoveryStatus = {
  lastSnapshot: RecoverySnapshotSummary | null
  snapshots: RecoverySnapshotSummary[]
  hasConfigRelease: boolean
  hasContentRelease: boolean
  configReleaseId: string | null
  contentReleaseId: string | null
}

export type RecoveryActionResult = {
  ok: boolean
  message: string
  error?: string
  snapshotId?: string
  releaseId?: string
  restarted?: boolean
  warnings?: string[]
  detail?: string
}
