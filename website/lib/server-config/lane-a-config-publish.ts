import { promises as fs } from "node:fs"
import path from "node:path"

import { CONFIG_FILES, restartServicesFor } from "./catalog.ts"
import {
  fieldsForObjgen,
  getLiveConfigDir,
  getRuntimeDir,
  getWorkingConfigDir,
} from "./fs.ts"
import { parseConstantsXml } from "./constants-xml.ts"
import { parseNewCharacterXml } from "./newcharacter-xml.ts"
import { parseObjgenConfig } from "./objgen-config.ts"
import { parseSetupXml } from "./setup-xml.ts"
import type { ConfigFileId } from "./types.ts"
import { validateConfigDocument } from "./validate.ts"

export const LANE_A_CONFIG_RELEASES_KEEP = 5

export type LaneAConfigPhase =
  | "validating"
  | "validated"
  | "applying"
  | "applied"
  | "rolled_back"
  | "failed"

export type LaneAConfigPublishResult = {
  ok: boolean
  phase: LaneAConfigPhase
  releaseId?: string
  filesCopied: number
  files: string[]
  restart: Array<"lobby" | "world" | "channel">
  warnings: string[]
  errors: string[]
  configDest: string
  releasesDir?: string
  releasePath?: string
  error?: string
}

function getReleasesDir(): string {
  if (process.env.OPS_CONFIG_RELEASES_DIR?.trim()) {
    return path.resolve(process.env.OPS_CONFIG_RELEASES_DIR.trim())
  }
  return path.join(getRuntimeDir(), "releases", "lane-a-config")
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

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true })
}

async function copyFileSafe(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest))
  await fs.copyFile(src, dest)
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
  for (const id of ids.slice(LANE_A_CONFIG_RELEASES_KEEP)) {
    await rmrf(path.join(releasesDir, id))
  }
}

async function setLatest(releasesDir: string, releaseId: string): Promise<void> {
  await fs.writeFile(path.join(releasesDir, "LATEST"), `${releaseId}\n`, "utf8")
}

export async function getLatestConfigReleaseId(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(getReleasesDir(), "LATEST"), "utf8")
    const id = raw.trim()
    return id || null
  } catch {
    return null
  }
}

function emptyResult(
  phase: LaneAConfigPhase,
  partial?: Partial<LaneAConfigPublishResult>
): LaneAConfigPublishResult {
  return {
    ok: false,
    phase,
    filesCopied: 0,
    files: [],
    restart: [],
    warnings: [],
    errors: [],
    configDest: getLiveConfigDir(),
    ...partial,
  }
}

function managedFilenames(): string[] {
  return CONFIG_FILES.map((f) => f.filename)
}

function idForFilename(filename: string): ConfigFileId | null {
  const meta = CONFIG_FILES.find((f) => f.filename === filename)
  return meta?.id ?? null
}

async function validateWorkingXml(
  id: ConfigFileId,
  xml: string
): Promise<import("./validate.ts").ValidationIssue[]> {
  const meta = CONFIG_FILES.find((f) => f.id === id)
  if (!meta) return []

  if (meta.editor === "constants") {
    return validateConfigDocument(parseConstantsXml(xml))
  }
  if (meta.editor === "setup") {
    return validateConfigDocument(parseSetupXml(xml))
  }
  if (meta.editor === "newcharacter") {
    return validateConfigDocument(parseNewCharacterXml(xml))
  }

  const fields = await fieldsForObjgen(id as "lobby" | "world" | "channel")
  const doc = parseObjgenConfig(xml, fields)
  // Round-trip sanity: must re-parse without throwing
  return validateConfigDocument(doc, fields)
}

async function checkCandidatePortCollisions(
  candidateDir: string,
  filenames: string[]
): Promise<{ errors: string[]; warnings: string[] }> {
  const errors: string[] = []
  const warnings: string[] = []
  const ports = new Map<number, string>()

  for (const filename of filenames) {
    const id = idForFilename(filename)
    if (id !== "lobby" && id !== "world" && id !== "channel") continue
    const xml = await fs.readFile(path.join(candidateDir, filename), "utf8")
    const fields = await fieldsForObjgen(id)
    const doc = parseObjgenConfig(xml, fields)
    const port = doc.members.Port
    if (typeof port !== "number") continue
    const prev = ports.get(port)
    if (prev) {
      errors.push(
        `Port collision: ${prev} and ${filename} both use Port ${port}`
      )
    } else {
      ports.set(port, filename)
    }

    // Lobby web port vs game ports
    if (id === "lobby") {
      const web = doc.members.WebListeningPort
      if (typeof web === "number") {
        if (web === port) {
          errors.push(
            `lobby.xml: WebListeningPort ${web} collides with lobby Port`
          )
        }
        const clash = ports.get(web)
        if (clash && clash !== filename) {
          errors.push(
            `Port collision: ${clash} Port and lobby.xml WebListeningPort both ${web}`
          )
        }
      }
    }
  }

  if (ports.size && ports.size < 3) {
    warnings.push(
      "Candidate does not include all of lobby/world/channel — port checks only cover staged process configs"
    )
  }

  return { errors, warnings }
}

/** Stage working-copy config XMLs under releases/lane-a-config/<id>/candidate. */
export async function validateLaneAConfig(
  onlyIds?: ConfigFileId[]
): Promise<LaneAConfigPublishResult> {
  const live = getLiveConfigDir()
  const working = getWorkingConfigDir()
  const releasesDir = getReleasesDir()
  const releaseId = newReleaseId()
  const releasePath = path.join(releasesDir, releaseId)
  const candidate = path.join(releasePath, "candidate")

  const warnings: string[] = []
  const errors: string[] = []
  const files: string[] = []
  const changedIds: ConfigFileId[] = []

  await ensureDir(candidate)

  const allow = onlyIds?.length ? new Set(onlyIds) : null

  for (const meta of CONFIG_FILES) {
    if (allow && !allow.has(meta.id)) continue
    const src = path.join(working, meta.filename)
    if (!(await pathExists(src))) {
      if (meta.requiredToRun) {
        errors.push(`Missing working copy: ${meta.filename}`)
      } else {
        warnings.push(`Optional file not in working copy: ${meta.filename}`)
      }
      continue
    }
    let xml: string
    try {
      xml = await fs.readFile(src, "utf8")
    } catch (e) {
      errors.push(
        `Failed to read ${meta.filename}: ${e instanceof Error ? e.message : "error"}`
      )
      continue
    }
    if (!xml.trim() || !xml.includes("<")) {
      errors.push(`Invalid or empty XML: ${meta.filename}`)
      continue
    }

    // Stage-2: schema + semantic validation against candidate content
    try {
      const schemaIssues = await validateWorkingXml(meta.id, xml)
      for (const issue of schemaIssues) {
        const line = `${meta.filename} ${issue.path}: ${issue.message}`
        if (issue.severity === "error") errors.push(line)
        else warnings.push(line)
      }
    } catch (e) {
      errors.push(
        `${meta.filename}: ${e instanceof Error ? e.message : "validation failed"}`
      )
      continue
    }

    await copyFileSafe(src, path.join(candidate, meta.filename))
    files.push(meta.filename)
    changedIds.push(meta.id)
  }

  // Cross-file: port uniqueness among process configs in this candidate
  if (errors.length === 0) {
    const portCheck = await checkCandidatePortCollisions(candidate, files)
    errors.push(...portCheck.errors)
    warnings.push(...portCheck.warnings)
  }

  if (!files.length) {
    errors.push("Nothing to publish — seed server-content/config from live first")
  }

  const restart = restartServicesFor(changedIds)
  const ok = errors.length === 0
  const phase: LaneAConfigPhase = ok ? "validated" : "failed"
  await writeManifest(releasePath, {
    phase,
    createdAt: new Date().toISOString(),
    files,
    filesCopied: files.length,
    restart,
    warnings,
    errors,
    onlyIds: onlyIds ?? null,
  })

  return {
    ok,
    phase,
    releaseId,
    filesCopied: files.length,
    files,
    restart,
    warnings,
    errors,
    configDest: live,
    releasesDir,
    releasePath,
    error: ok ? undefined : errors.join("; "),
  }
}

export async function applyLaneAConfig(
  releaseId: string
): Promise<LaneAConfigPublishResult> {
  const live = getLiveConfigDir()
  const releasesDir = getReleasesDir()
  const releasePath = path.join(releasesDir, releaseId)
  const candidate = path.join(releasePath, "candidate")
  const previous = path.join(releasePath, "previous")

  if (!(await pathExists(candidate))) {
    return emptyResult("failed", {
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
    return emptyResult("failed", {
      releaseId,
      releasePath,
      releasesDir,
      error: "Cannot apply a failed validation release",
      errors: ["Cannot apply a failed validation release"],
    })
  }

  try {
    await ensureDir(previous)
    await ensureDir(live)

    const candidateFiles = (await fs.readdir(candidate)).filter((f) =>
      managedFilenames().includes(f)
    )

    // Snapshot live counterparts
    for (const filename of candidateFiles) {
      const livePath = path.join(live, filename)
      if (await pathExists(livePath)) {
        await copyFileSafe(livePath, path.join(previous, filename))
      }
    }

    for (const filename of candidateFiles) {
      await copyFileSafe(
        path.join(candidate, filename),
        path.join(live, filename)
      )
    }

    const ids = candidateFiles
      .map((f) => idForFilename(f))
      .filter((x): x is ConfigFileId => x != null)
    const restart =
      Array.isArray(manifest.restart) && manifest.restart.length
        ? (manifest.restart as Array<"lobby" | "world" | "channel">)
        : restartServicesFor(ids)

    const warnings = Array.isArray(manifest.warnings)
      ? [...(manifest.warnings as string[])]
      : []

    await writeManifest(releasePath, {
      ...manifest,
      phase: "applied",
      appliedAt: new Date().toISOString(),
      files: candidateFiles,
      filesCopied: candidateFiles.length,
      restart,
      warnings,
    })
    await setLatest(releasesDir, releaseId)
    await pruneReleases(releasesDir)

    return {
      ok: true,
      phase: "applied",
      releaseId,
      filesCopied: candidateFiles.length,
      files: candidateFiles,
      restart,
      warnings,
      errors: [],
      configDest: live,
      releasesDir,
      releasePath,
    }
  } catch (e) {
    const msg =
      e instanceof Error ? `Apply failed: ${e.message}` : "Apply failed"
    await writeManifest(releasePath, { ...manifest, phase: "failed", error: msg })
    return emptyResult("failed", {
      releaseId,
      releasePath,
      releasesDir,
      error: msg,
      errors: [msg],
    })
  }
}

export async function rollbackLaneAConfig(
  releaseId?: string
): Promise<LaneAConfigPublishResult> {
  const live = getLiveConfigDir()
  const releasesDir = getReleasesDir()
  const id = releaseId?.trim() || (await getLatestConfigReleaseId())
  if (!id) {
    return emptyResult("failed", {
      releasesDir,
      error: "No Lane A config release to roll back",
      errors: ["No Lane A config release to roll back"],
    })
  }

  const releasePath = path.join(releasesDir, id)
  const previous = path.join(releasePath, "previous")
  if (!(await pathExists(previous))) {
    return emptyResult("failed", {
      releaseId: id,
      releasePath,
      releasesDir,
      error: `No previous snapshot for release ${id}`,
      errors: [`No previous snapshot for release ${id}`],
    })
  }

  try {
    await ensureDir(live)
    const prevFiles = (await fs.readdir(previous)).filter((f) =>
      managedFilenames().includes(f)
    )
    for (const filename of prevFiles) {
      await copyFileSafe(
        path.join(previous, filename),
        path.join(live, filename)
      )
    }

    let manifest: Record<string, unknown> = {}
    try {
      manifest = JSON.parse(
        await fs.readFile(path.join(releasePath, "manifest.json"), "utf8")
      ) as Record<string, unknown>
    } catch {
      /* ok */
    }

    const ids = prevFiles
      .map((f) => idForFilename(f))
      .filter((x): x is ConfigFileId => x != null)
    const restart =
      Array.isArray(manifest.restart) && manifest.restart.length
        ? (manifest.restart as Array<"lobby" | "world" | "channel">)
        : restartServicesFor(ids)

    await writeManifest(releasePath, {
      ...manifest,
      phase: "rolled_back",
      rolledBackAt: new Date().toISOString(),
      files: prevFiles,
      filesCopied: prevFiles.length,
      restart,
    })

    return {
      ok: true,
      phase: "rolled_back",
      releaseId: id,
      filesCopied: prevFiles.length,
      files: prevFiles,
      restart,
      warnings: [],
      errors: [],
      configDest: live,
      releasesDir,
      releasePath,
    }
  } catch (e) {
    const msg =
      e instanceof Error ? `Rollback failed: ${e.message}` : "Rollback failed"
    return emptyResult("failed", {
      releaseId: id,
      releasePath,
      releasesDir,
      error: msg,
      errors: [msg],
    })
  }
}

export async function publishLaneAConfig(
  onlyIds?: ConfigFileId[]
): Promise<LaneAConfigPublishResult> {
  const validated = await validateLaneAConfig(onlyIds)
  if (!validated.ok || !validated.releaseId) return validated
  return applyLaneAConfig(validated.releaseId)
}
