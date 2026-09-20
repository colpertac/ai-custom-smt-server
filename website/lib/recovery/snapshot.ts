import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import { CONFIG_FILES } from "@/lib/server-config/catalog"
import { getLiveConfigDir } from "@/lib/server-config/fs"

import {
  ADMIN_PAYOUTS_ZIP,
  ADMIN_REPORT_REWARDS_ZIP,
  getDatastorePackagesDir,
  getDatastoreShopsDir,
  getRecoveryReleasesDir,
  newRecoveryId,
  RECOVERY_SNAPSHOTS_KEEP,
} from "./paths"
import type {
  RecoverySnapshotFile,
  RecoverySnapshotManifest,
  RecoverySnapshotSummary,
} from "./types"

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function copyFileHashed(
  src: string,
  dest: string,
  relPath: string
): Promise<RecoverySnapshotFile | null> {
  try {
    const buf = await fs.readFile(src)
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, buf)
    return {
      path: relPath,
      sha256: createHash("sha256").update(buf).digest("hex"),
      bytes: buf.byteLength,
    }
  } catch {
    return null
  }
}

async function pruneSnapshots(releasesDir: string): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(releasesDir)
  } catch {
    return
  }
  const ids = entries
    .filter((e) => e !== "LATEST" && !e.startsWith("."))
    .sort()
    .reverse()
  for (const id of ids.slice(RECOVERY_SNAPSHOTS_KEEP)) {
    await fs.rm(path.join(releasesDir, id), { recursive: true, force: true })
  }
}

async function writeLatest(releasesDir: string, id: string): Promise<void> {
  await fs.writeFile(path.join(releasesDir, "LATEST"), `${id}\n`, "utf8")
}

/**
 * Snapshot live config XMLs + Lane A shops/admin packages into
 * runtime/releases/recovery/<id>/. Does not restart anything.
 */
export async function createRecoverySnapshot(options?: {
  actor?: string | null
  reason?: string
}): Promise<RecoverySnapshotManifest> {
  const releasesDir = getRecoveryReleasesDir()
  const id = newRecoveryId()
  const root = path.join(releasesDir, id)
  const configDest = path.join(root, "config")
  const laneADest = path.join(root, "lane-a")
  await fs.mkdir(configDest, { recursive: true })
  await fs.mkdir(path.join(laneADest, "shops"), { recursive: true })
  await fs.mkdir(path.join(laneADest, "packages"), { recursive: true })

  const files: RecoverySnapshotFile[] = []
  const liveConfig = getLiveConfigDir()

  for (const meta of CONFIG_FILES) {
    const src = path.join(liveConfig, meta.filename)
    const dest = path.join(configDest, meta.filename)
    const entry = await copyFileHashed(src, dest, `config/${meta.filename}`)
    if (entry) files.push(entry)
  }

  const shopsLive = getDatastoreShopsDir()
  try {
    const shopFiles = (await fs.readdir(shopsLive))
      .filter((f) => f.startsWith("compshop-") && f.endsWith(".xml"))
      .sort()
    for (const name of shopFiles) {
      const entry = await copyFileHashed(
        path.join(shopsLive, name),
        path.join(laneADest, "shops", name),
        `lane-a/shops/${name}`
      )
      if (entry) files.push(entry)
    }
  } catch {
    /* shops dir may be missing */
  }

  const packagesLive = getDatastorePackagesDir()
  for (const name of [ADMIN_PAYOUTS_ZIP, ADMIN_REPORT_REWARDS_ZIP]) {
    const entry = await copyFileHashed(
      path.join(packagesLive, name),
      path.join(laneADest, "packages", name),
      `lane-a/packages/${name}`
    )
    if (entry) files.push(entry)
  }

  const manifest: RecoverySnapshotManifest = {
    id,
    createdAt: new Date().toISOString(),
    actor: options?.actor?.trim() || null,
    reason: options?.reason?.trim() || "manual",
    files,
  }
  await fs.writeFile(
    path.join(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  )
  await writeLatest(releasesDir, id)
  await pruneSnapshots(releasesDir)
  return manifest
}

async function readManifest(
  id: string
): Promise<RecoverySnapshotManifest | null> {
  try {
    const raw = await fs.readFile(
      path.join(getRecoveryReleasesDir(), id, "manifest.json"),
      "utf8"
    )
    return JSON.parse(raw) as RecoverySnapshotManifest
  } catch {
    return null
  }
}

function toSummary(m: RecoverySnapshotManifest): RecoverySnapshotSummary {
  return {
    id: m.id,
    createdAt: m.createdAt,
    actor: m.actor,
    reason: m.reason,
    fileCount: m.files.length,
  }
}

export async function listRecoverySnapshots(): Promise<
  RecoverySnapshotSummary[]
> {
  const releasesDir = getRecoveryReleasesDir()
  let entries: string[]
  try {
    entries = await fs.readdir(releasesDir)
  } catch {
    return []
  }
  const ids = entries
    .filter((e) => e !== "LATEST" && !e.startsWith("."))
    .sort()
    .reverse()
  const out: RecoverySnapshotSummary[] = []
  for (const id of ids) {
    const m = await readManifest(id)
    if (m) out.push(toSummary(m))
  }
  return out
}

export async function getLatestRecoverySnapshot(): Promise<RecoverySnapshotSummary | null> {
  try {
    const raw = await fs.readFile(
      path.join(getRecoveryReleasesDir(), "LATEST"),
      "utf8"
    )
    const id = raw.trim()
    if (!id) return null
    const m = await readManifest(id)
    return m ? toSummary(m) : null
  } catch {
    return null
  }
}

export async function recoverySnapshotExists(id: string): Promise<boolean> {
  return pathExists(path.join(getRecoveryReleasesDir(), id, "manifest.json"))
}
