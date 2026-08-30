import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import JSZip from "jszip"

import {
  generateDropSetXml,
  generateEventsXml,
  payoutPackagePaths,
} from "./dungeon-payout-generate.ts"
import { putPayoutSchema } from "./dungeon-payout-schema.ts"
import type { DungeonPayoutFile } from "./dungeon-payout-types.ts"

export const LANE_A_PAYOUTS_ZIP = "zzz_ai_custom_payouts_admin.zip"
export const LANE_A_RELEASES_KEEP = 5

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

export type LaneAPhase =
  | "validating"
  | "validated"
  | "applying"
  | "applied"
  | "rolled_back"
  | "failed"

export type LaneAPublishResult = {
  ok: boolean
  phase: LaneAPhase
  releaseId?: string
  shopsCopied: number
  shopsRemoved: number
  payoutsPackaged: number
  disabledPayouts: string[]
  skippedConflicts: string[]
  warnings: string[]
  errors: string[]
  shopsDest: string
  payoutsZipPath: string
  releasesDir?: string
  releasePath?: string
  error?: string
}

export type LaneAReleaseSummary = {
  id: string
  path: string
  createdAt?: string
  shopsCopied?: number
  payoutsPackaged?: number
  hasPrevious: boolean
  applied: boolean
}

function shopsWorkingDir(): string {
  if (process.env.COMP_SHOPS_DIR?.trim()) {
    return path.resolve(process.env.COMP_SHOPS_DIR.trim())
  }
  return path.join(REPO_ROOT, "server-content", "shops")
}

function payoutsWorkingDir(): string {
  if (process.env.COMP_PAYOUTS_DIR?.trim()) {
    return path.resolve(process.env.COMP_PAYOUTS_DIR.trim())
  }
  return path.join(REPO_ROOT, "server-content", "payouts")
}

export function getRuntimeDir(): string {
  if (process.env.OPS_RUNTIME?.trim()) {
    return path.resolve(process.env.OPS_RUNTIME.trim())
  }
  return path.resolve(REPO_ROOT, "../comp_hack/runtime")
}

export function getReleasesDir(): string {
  if (process.env.OPS_RELEASES_DIR?.trim()) {
    return path.resolve(process.env.OPS_RELEASES_DIR.trim())
  }
  return path.join(getRuntimeDir(), "releases", "lane-a")
}

function newReleaseId(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true })
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

async function copyFileSafe(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest))
  await fs.copyFile(src, dest)
}

async function listShopFiles(dir: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  return entries.filter((f) => /^compshop-\d+\.xml$/i.test(f)).sort()
}

/**
 * Full mirror of managed shops (`compshop-*.xml` only):
 * copy every source shop into dest, then delete dest shops missing from source.
 */
async function mirrorShops(
  sourceDir: string,
  destDir: string
): Promise<{ copied: number; removed: string[] }> {
  await ensureDir(destDir)
  const sourceFiles = await listShopFiles(sourceDir)
  const sourceSet = new Set(sourceFiles)
  const destFiles = await listShopFiles(destDir)
  const removed: string[] = []

  for (const filename of sourceFiles) {
    await copyFileSafe(
      path.join(sourceDir, filename),
      path.join(destDir, filename)
    )
  }
  for (const filename of destFiles) {
    if (sourceSet.has(filename)) continue
    await fs.unlink(path.join(destDir, filename))
    removed.push(filename)
  }
  return { copied: sourceFiles.length, removed }
}

async function readPayoutJson(id: string): Promise<DungeonPayoutFile> {
  const raw = await fs.readFile(
    path.join(payoutsWorkingDir(), `${id}.json`),
    "utf8"
  )
  const parsed = putPayoutSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new Error(
      `Invalid payout file ${id}: ${parsed.error.issues[0]?.message}`
    )
  }
  if (parsed.data.payout.id !== id) {
    throw new Error(`Payout file id mismatch for ${id}`)
  }
  return parsed.data
}

async function listPayoutIds(): Promise<{ id: string; enabled: boolean }[]> {
  const dir = payoutsWorkingDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: { id: string; enabled: boolean }[] = []
  for (const filename of entries) {
    if (!filename.endsWith(".json") || filename.startsWith(".")) continue
    const id = filename.slice(0, -".json".length)
    try {
      const file = await readPayoutJson(id)
      out.push({ id, enabled: file.payout.enabled })
    } catch {
      /* skip invalid */
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

async function existingDropSetIds(packagesDest: string): Promise<Set<number>> {
  const ids = new Set<number>()
  let entries: string[]
  try {
    entries = await fs.readdir(packagesDest)
  } catch {
    return ids
  }
  for (const name of entries) {
    if (!name.endsWith(".zip") || name === LANE_A_PAYOUTS_ZIP) continue
    try {
      const buf = await fs.readFile(path.join(packagesDest, name))
      const zip = await JSZip.loadAsync(buf)
      for (const [entryName, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue
        if (!/dropset/i.test(entryName) || !entryName.endsWith(".xml")) continue
        const xml = await entry.async("string")
        for (const m of xml.matchAll(
          /<member\s+name="ID">\s*(\d+)\s*<\/member>/gi
        )) {
          ids.add(Number(m[1]))
        }
      }
    } catch {
      /* skip */
    }
  }
  return ids
}

function emptyResult(
  phase: LaneAPhase,
  runtime: string,
  partial?: Partial<LaneAPublishResult>
): LaneAPublishResult {
  return {
    ok: false,
    phase,
    shopsCopied: 0,
    shopsRemoved: 0,
    payoutsPackaged: 0,
    disabledPayouts: [],
    skippedConflicts: [],
    warnings: [],
    errors: [],
    shopsDest: path.join(runtime, "datastore", "shops"),
    payoutsZipPath: path.join(
      runtime,
      "datastore",
      "packages",
      LANE_A_PAYOUTS_ZIP
    ),
    ...partial,
  }
}

async function writeManifest(
  releasePath: string,
  data: Record<string, unknown>
): Promise<void> {
  await fs.writeFile(
    path.join(releasePath, "manifest.json"),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  )
}

async function pruneReleases(releasesDir: string): Promise<void> {
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
  for (const id of ids.slice(LANE_A_RELEASES_KEEP)) {
    await rmrf(path.join(releasesDir, id))
  }
}

async function setLatest(releasesDir: string, releaseId: string): Promise<void> {
  await fs.writeFile(path.join(releasesDir, "LATEST"), `${releaseId}\n`, "utf8")
}

export async function getLatestReleaseId(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(getReleasesDir(), "LATEST"), "utf8")
    const id = raw.trim()
    return id || null
  } catch {
    return null
  }
}

export async function listLaneAReleases(): Promise<LaneAReleaseSummary[]> {
  const releasesDir = getReleasesDir()
  let entries: string[]
  try {
    entries = await fs.readdir(releasesDir)
  } catch {
    return []
  }
  const latest = await getLatestReleaseId()
  const out: LaneAReleaseSummary[] = []
  for (const id of entries.filter((e) => e !== "LATEST").sort().reverse()) {
    const releasePath = path.join(releasesDir, id)
    let manifest: Record<string, unknown> = {}
    try {
      manifest = JSON.parse(
        await fs.readFile(path.join(releasePath, "manifest.json"), "utf8")
      ) as Record<string, unknown>
    } catch {
      /* optional */
    }
    out.push({
      id,
      path: releasePath,
      createdAt:
        typeof manifest.createdAt === "string" ? manifest.createdAt : undefined,
      shopsCopied:
        typeof manifest.shopsCopied === "number"
          ? manifest.shopsCopied
          : undefined,
      payoutsPackaged:
        typeof manifest.payoutsPackaged === "number"
          ? manifest.payoutsPackaged
          : undefined,
      hasPrevious: await pathExists(path.join(releasePath, "previous")),
      applied: latest === id || manifest.phase === "applied",
    })
  }
  return out
}

/** Build candidate under releases/<id>/candidate and validate. Does not touch live. */
export async function validateLaneA(): Promise<LaneAPublishResult> {
  const runtime = getRuntimeDir()
  const packagesLive = path.join(runtime, "datastore", "packages")
  const shopsLive = path.join(runtime, "datastore", "shops")
  const releasesDir = getReleasesDir()
  const releaseId = newReleaseId()
  const releasePath = path.join(releasesDir, releaseId)
  const candidateShops = path.join(releasePath, "candidate", "shops")
  const candidatePackages = path.join(releasePath, "candidate", "packages")
  const candidateZip = path.join(candidatePackages, LANE_A_PAYOUTS_ZIP)

  const warnings: string[] = []
  const errors: string[] = []
  const disabledPayouts: string[] = []
  const skippedConflicts: string[] = []

  await ensureDir(candidateShops)
  await ensureDir(candidatePackages)

  let shopsCopied = 0
  try {
    const files = await listShopFiles(shopsWorkingDir())
    if (!files.length) {
      warnings.push("No compshop-*.xml files in working copy")
    }
    for (const filename of files) {
      const src = path.join(shopsWorkingDir(), filename)
      const xml = await fs.readFile(src, "utf8")
      if (!xml.trim() || !xml.includes("<")) {
        errors.push(`Invalid or empty shop XML: ${filename}`)
        continue
      }
      await copyFileSafe(src, path.join(candidateShops, filename))
      shopsCopied++
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? `Failed to read shops working copy: ${e.message}`
        : "Failed to read shops working copy"
    await writeManifest(releasePath, {
      phase: "failed",
      createdAt: new Date().toISOString(),
      error: msg,
    })
    return emptyResult("failed", runtime, {
      releaseId,
      releasePath,
      releasesDir,
      errors: [msg],
      error: msg,
      shopsDest: shopsLive,
      payoutsZipPath: path.join(packagesLive, LANE_A_PAYOUTS_ZIP),
    })
  }

  let payoutsPackaged = 0
  try {
    const items = await listPayoutIds()
    const takenDropSets = await existingDropSetIds(packagesLive)
    const usedInCandidate = new Set<number>()

    if (!items.length) {
      warnings.push("No payout JSON files in working copy")
    }

    const zip = new JSZip()
    for (const item of items) {
      if (!item.enabled) {
        disabledPayouts.push(item.id)
        continue
      }
      const file = await readPayoutJson(item.id)
      const payout = file.payout
      if (takenDropSets.has(payout.dropSetId)) {
        skippedConflicts.push(
          `${payout.id} (DropSet ${payout.dropSetId} already in another package)`
        )
        continue
      }
      if (usedInCandidate.has(payout.dropSetId)) {
        errors.push(
          `Duplicate DropSet ${payout.dropSetId} within candidate (payout ${payout.id})`
        )
        continue
      }
      const paths = payoutPackagePaths(payout)
      zip.file(paths.eventsPath, generateEventsXml(payout))
      zip.file(paths.dropSetPath, generateDropSetXml(payout))
      usedInCandidate.add(payout.dropSetId)
      payoutsPackaged++
    }

    if (payoutsPackaged > 0) {
      const buf = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
      })
      await fs.writeFile(candidateZip, buf)
    } else if (items.length) {
      warnings.push(
        "No payout package in candidate (all disabled or DropSet conflicts)"
      )
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? `Failed to build payout package: ${e.message}`
        : "Failed to build payout package"
    errors.push(msg)
  }

  if (disabledPayouts.length) {
    warnings.push(
      `${disabledPayouts.length} disabled payout(s) skipped (enable in /admin/payouts to publish)`
    )
  }
  if (skippedConflicts.length) {
    warnings.push(
      `Skipped conflicting payout(s): ${skippedConflicts.join("; ")}`
    )
  }

  const liveShopFiles = await listShopFiles(shopsLive)
  const candidateSet = new Set(await listShopFiles(candidateShops))
  const willRemove = liveShopFiles.filter((f) => !candidateSet.has(f))
  if (willRemove.length) {
    warnings.push(
      `Will remove ${willRemove.length} live shop(s) not in working copy: ${willRemove.join(", ")}`
    )
  }

  if (shopsCopied === 0 && payoutsPackaged === 0 && willRemove.length === 0) {
    errors.push("Nothing to publish — seed shops/payouts working copy first")
  }

  const ok = errors.length === 0
  const phase: LaneAPhase = ok ? "validated" : "failed"
  await writeManifest(releasePath, {
    phase,
    createdAt: new Date().toISOString(),
    shopsCopied,
    shopsRemoved: willRemove.length,
    shopsToRemove: willRemove,
    payoutsPackaged,
    disabledPayouts,
    skippedConflicts,
    warnings,
    errors,
  })

  return {
    ok,
    phase,
    releaseId,
    shopsCopied,
    shopsRemoved: willRemove.length,
    payoutsPackaged,
    disabledPayouts,
    skippedConflicts,
    warnings,
    errors,
    shopsDest: shopsLive,
    payoutsZipPath: path.join(packagesLive, LANE_A_PAYOUTS_ZIP),
    releasesDir,
    releasePath,
    error: ok ? undefined : errors.join("; "),
  }
}

/** Snapshot live → previous/, then copy candidate → live. */
export async function applyLaneA(
  releaseId: string
): Promise<LaneAPublishResult> {
  const runtime = getRuntimeDir()
  const releasesDir = getReleasesDir()
  const releasePath = path.join(releasesDir, releaseId)
  const candidateShops = path.join(releasePath, "candidate", "shops")
  const candidateZip = path.join(
    releasePath,
    "candidate",
    "packages",
    LANE_A_PAYOUTS_ZIP
  )
  const previousShops = path.join(releasePath, "previous", "shops")
  const previousPackages = path.join(releasePath, "previous", "packages")
  const shopsLive = path.join(runtime, "datastore", "shops")
  const packagesLive = path.join(runtime, "datastore", "packages")
  const liveZip = path.join(packagesLive, LANE_A_PAYOUTS_ZIP)

  if (!(await pathExists(path.join(releasePath, "candidate")))) {
    return emptyResult("failed", runtime, {
      releaseId,
      releasePath,
      releasesDir,
      error: `Release candidate not found: ${releaseId}`,
      errors: [`Release candidate not found: ${releaseId}`],
    })
  }

  let manifest: Record<string, unknown> = {}
  try {
    manifest = JSON.parse(
      await fs.readFile(path.join(releasePath, "manifest.json"), "utf8")
    ) as Record<string, unknown>
  } catch {
    /* ok */
  }
  if (manifest.phase === "failed") {
    return emptyResult("failed", runtime, {
      releaseId,
      releasePath,
      releasesDir,
      error: "Cannot apply a failed validation release",
      errors: ["Cannot apply a failed validation release"],
    })
  }

  try {
    await ensureDir(previousShops)
    await ensureDir(previousPackages)
    await ensureDir(shopsLive)
    await ensureDir(packagesLive)

    // Snapshot current live shops (compshop-*.xml only) and admin payout zip.
    for (const filename of await listShopFiles(shopsLive)) {
      await copyFileSafe(
        path.join(shopsLive, filename),
        path.join(previousShops, filename)
      )
    }
    if (await pathExists(liveZip)) {
      await copyFileSafe(liveZip, path.join(previousPackages, LANE_A_PAYOUTS_ZIP))
    }

    // Full mirror: copy candidate shops, delete live shops absent from candidate.
    const mirror = await mirrorShops(candidateShops, shopsLive)

    // Apply or remove payout zip.
    if (await pathExists(candidateZip)) {
      await copyFileSafe(candidateZip, liveZip)
    } else if (await pathExists(liveZip)) {
      await fs.unlink(liveZip)
    }

    const shopsCopied =
      typeof manifest.shopsCopied === "number"
        ? manifest.shopsCopied
        : mirror.copied
    const shopsRemoved = mirror.removed.length
    const payoutsPackaged =
      typeof manifest.payoutsPackaged === "number"
        ? manifest.payoutsPackaged
        : (await pathExists(candidateZip))
          ? 1
          : 0

    const warnings = Array.isArray(manifest.warnings)
      ? [...(manifest.warnings as string[])]
      : []
    if (mirror.removed.length) {
      warnings.push(
        `Removed ${mirror.removed.length} shop(s) from live: ${mirror.removed.join(", ")}`
      )
    }

    await writeManifest(releasePath, {
      ...manifest,
      phase: "applied",
      appliedAt: new Date().toISOString(),
      shopsCopied,
      shopsRemoved,
      shopsRemovedFiles: mirror.removed,
      payoutsPackaged,
      warnings,
    })
    await setLatest(releasesDir, releaseId)
    await pruneReleases(releasesDir)

    return {
      ok: true,
      phase: "applied",
      releaseId,
      shopsCopied,
      shopsRemoved,
      payoutsPackaged:
        typeof manifest.payoutsPackaged === "number"
          ? manifest.payoutsPackaged
          : payoutsPackaged,
      disabledPayouts: Array.isArray(manifest.disabledPayouts)
        ? (manifest.disabledPayouts as string[])
        : [],
      skippedConflicts: Array.isArray(manifest.skippedConflicts)
        ? (manifest.skippedConflicts as string[])
        : [],
      warnings,
      errors: [],
      shopsDest: shopsLive,
      payoutsZipPath: liveZip,
      releasesDir,
      releasePath,
    }
  } catch (e) {
    const msg =
      e instanceof Error ? `Apply failed: ${e.message}` : "Apply failed"
    await writeManifest(releasePath, {
      ...manifest,
      phase: "failed",
      error: msg,
    })
    return emptyResult("failed", runtime, {
      releaseId,
      releasePath,
      releasesDir,
      error: msg,
      errors: [msg],
    })
  }
}

/** Restore previous/ snapshot from a release (default: LATEST). */
export async function rollbackLaneA(
  releaseId?: string
): Promise<LaneAPublishResult> {
  const runtime = getRuntimeDir()
  const releasesDir = getReleasesDir()
  const id = releaseId?.trim() || (await getLatestReleaseId())
  if (!id) {
    return emptyResult("failed", runtime, {
      releasesDir,
      error: "No Lane A release to roll back",
      errors: ["No Lane A release to roll back"],
    })
  }

  const releasePath = path.join(releasesDir, id)
  const previousShops = path.join(releasePath, "previous", "shops")
  const previousZip = path.join(
    releasePath,
    "previous",
    "packages",
    LANE_A_PAYOUTS_ZIP
  )
  const shopsLive = path.join(runtime, "datastore", "shops")
  const packagesLive = path.join(runtime, "datastore", "packages")
  const liveZip = path.join(packagesLive, LANE_A_PAYOUTS_ZIP)

  if (!(await pathExists(path.join(releasePath, "previous")))) {
    return emptyResult("failed", runtime, {
      releaseId: id,
      releasePath,
      releasesDir,
      error: `No previous snapshot for release ${id}`,
      errors: [`No previous snapshot for release ${id}`],
    })
  }

  try {
    await ensureDir(shopsLive)
    await ensureDir(packagesLive)

    // Full mirror back to previous snapshot of managed shops.
    const mirror = await mirrorShops(previousShops, shopsLive)

    if (await pathExists(previousZip)) {
      await copyFileSafe(previousZip, liveZip)
    } else if (await pathExists(liveZip)) {
      await fs.unlink(liveZip)
    }

    let manifest: Record<string, unknown> = {}
    try {
      manifest = JSON.parse(
        await fs.readFile(path.join(releasePath, "manifest.json"), "utf8")
      ) as Record<string, unknown>
    } catch {
      /* ok */
    }
    const warnings: string[] = []
    if (mirror.removed.length) {
      warnings.push(
        `Rollback removed ${mirror.removed.length} shop(s) not in previous snapshot: ${mirror.removed.join(", ")}`
      )
    }
    await writeManifest(releasePath, {
      ...manifest,
      phase: "rolled_back",
      rolledBackAt: new Date().toISOString(),
      shopsRemoved: mirror.removed.length,
      shopsRemovedFiles: mirror.removed,
    })

    return {
      ok: true,
      phase: "rolled_back",
      releaseId: id,
      shopsCopied: mirror.copied,
      shopsRemoved: mirror.removed.length,
      payoutsPackaged: (await pathExists(previousZip)) ? 1 : 0,
      disabledPayouts: [],
      skippedConflicts: [],
      warnings,
      errors: [],
      shopsDest: shopsLive,
      payoutsZipPath: liveZip,
      releasesDir,
      releasePath,
    }
  } catch (e) {
    const msg =
      e instanceof Error ? `Rollback failed: ${e.message}` : "Rollback failed"
    return emptyResult("failed", runtime, {
      releaseId: id,
      releasePath,
      releasesDir,
      error: msg,
      errors: [msg],
    })
  }
}

/** Validate then apply (CLI / sidecar one-shot). */
export async function publishLaneA(): Promise<LaneAPublishResult> {
  const validated = await validateLaneA()
  if (!validated.ok || !validated.releaseId) {
    return validated
  }
  return applyLaneA(validated.releaseId)
}
