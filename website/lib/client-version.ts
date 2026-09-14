import { promises as fs } from "node:fs"
import path from "node:path"

import { DOMParser } from "@xmldom/xmldom"

import { applyLaneAConfigOps, validateLaneAConfigOps } from "@/lib/lane-a-config-ops"
import { publishOpsLaneB } from "@/lib/ops-sidecar"
import { updaterRoot } from "@/lib/report-reward-client-overlay"
import {
  loadConfigDocument,
  saveConfigDocument,
} from "@/lib/server-config/fs"
import type { ObjgenDocument } from "@/lib/server-config/types"
import { markClientVersionRestartPending } from "@/lib/client-version-pending"
import {
  DEFAULT_CLIENT_VERSION_CODE,
  DEFAULT_COMP_CLIENT_XML,
  describeClientVersionMismatch,
  formatLobbyVersion,
  lobbyFloatToCode,
  parseCompClientVersion,
  setCompClientVersion,
  type ClientVersionMismatchReason,
} from "@/lib/client-version-pair"

export {
  DEFAULT_CLIENT_VERSION_CODE,
  DEFAULT_COMP_CLIENT_XML,
  describeClientVersionMismatch,
  formatLobbyVersion,
  lobbyFloatToCode,
  parseCompClientVersion,
  setCompClientVersion,
} from "@/lib/client-version-pair"
export type {
  ClientVersionMismatch,
  ClientVersionMismatchReason,
} from "@/lib/client-version-pair"

export const MAX_COMP_CLIENT_BYTES = 256_000

export function overlayCompClientPath(): string {
  return path.join(updaterRoot(), "overlay", "comp_client.xml")
}

export function validateCompClientXml(xml: string): { versionCode: number } {
  const trimmed = xml.trim()
  if (!trimmed) {
    throw new Error("Paste your client's comp_client.xml")
  }
  if (Buffer.byteLength(trimmed, "utf8") > MAX_COMP_CLIENT_BYTES) {
    throw new Error(`XML is too large (max ${MAX_COMP_CLIENT_BYTES} bytes)`)
  }
  const doc = new DOMParser().parseFromString(trimmed, "text/xml")
  const parseError = doc.getElementsByTagName("parsererror")[0]
  if (parseError) {
    throw new Error("Not valid XML")
  }
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== "config") {
    throw new Error("Root element must be <config>")
  }
  const versionCode = parseCompClientVersion(trimmed)
  if (versionCode == null) {
    throw new Error(
      "Missing <version>integer</version> (lobby ClientVersion × 1000, e.g. 1666)"
    )
  }
  return { versionCode }
}

export async function readCompClientXml(): Promise<{
  xml: string
  exists: boolean
}> {
  try {
    const xml = await fs.readFile(overlayCompClientPath(), "utf8")
    return { xml, exists: true }
  } catch {
    return { xml: DEFAULT_COMP_CLIENT_XML, exists: false }
  }
}

export type ClientVersionStatus = {
  lobbyCode: number
  lobbyVersion: string
  overlayCode: number | null
  overlayExists: boolean
  nextCode: number
  nextVersion: string
  mismatched: boolean
  mismatchReason: ClientVersionMismatchReason
  targetCode: number
  targetVersion: string
}

export async function getClientVersionStatus(): Promise<ClientVersionStatus> {
  const { document } = await loadConfigDocument("lobby")
  const lobbyCode =
    document.kind === "objgen"
      ? lobbyFloatToCode(document.members["ClientVersion"])
      : DEFAULT_CLIENT_VERSION_CODE

  const overlay = await readCompClientXml()
  const overlayCode = overlay.exists
    ? parseCompClientVersion(overlay.xml)
    : null
  const nextCode = Math.max(lobbyCode, overlayCode ?? 0) + 1
  const mismatch = describeClientVersionMismatch({
    lobbyCode,
    overlayCode,
    overlayExists: overlay.exists,
  })

  return {
    lobbyCode,
    lobbyVersion: formatLobbyVersion(lobbyCode),
    overlayCode,
    overlayExists: overlay.exists,
    nextCode,
    nextVersion: formatLobbyVersion(nextCode),
    mismatched: mismatch.mismatched,
    mismatchReason: mismatch.reason,
    targetCode: mismatch.targetCode,
    targetVersion: mismatch.targetVersion,
  }
}

export type ApplyPairedClientVersionResult = {
  fromCode: number
  fromVersion: string
  toCode: number
  toVersion: string
  overlaySeeded: boolean
  overlayWritten: boolean
  rehashed: boolean
  lobbyApplied: boolean
  lobbyRestarted: boolean
  alreadyMatched: boolean
  message: string
}

async function applyPairedClientVersion(
  toCode: number,
  actor?: string,
  sourceXml?: string
): Promise<ApplyPairedClientVersionResult> {
  if (!Number.isInteger(toCode) || toCode < 1) {
    throw new Error("Client version code must be a positive integer")
  }
  const toVersion = formatLobbyVersion(toCode)
  const before = await getClientVersionStatus()
  const overlayPath = overlayCompClientPath()

  let previousXml: string | null = null
  try {
    previousXml = await fs.readFile(overlayPath, "utf8")
  } catch {
    previousXml = null
  }
  const overlaySeeded = previousXml == null
  const baseXml = sourceXml?.trim()
    ? sourceXml
    : (previousXml ?? DEFAULT_COMP_CLIENT_XML)
  const nextXml = setCompClientVersion(baseXml, toCode)
  const writtenXml = nextXml.endsWith("\n") ? nextXml : `${nextXml}\n`
  const overlayNeedsWrite = overlaySeeded || writtenXml !== previousXml

  const restoreOverlay = async () => {
    try {
      if (previousXml == null) await fs.unlink(overlayPath)
      else await fs.writeFile(overlayPath, previousXml, "utf8")
    } catch {
      /* best-effort */
    }
  }

  let rehashed = false
  if (overlayNeedsWrite) {
    await fs.mkdir(path.dirname(overlayPath), { recursive: true })
    await fs.writeFile(overlayPath, writtenXml, "utf8")
    const rehash = await publishOpsLaneB(actor)
    if (!rehash.ok) {
      await restoreOverlay()
      throw new Error(
        rehash.detail ||
          rehash.error ||
          "Wrote overlay version but ImagineUpdate list refresh failed"
      )
    }
    rehashed = true
  }

  const loaded = await loadConfigDocument("lobby")
  if (loaded.document.kind !== "objgen") {
    if (overlayNeedsWrite) await restoreOverlay()
    throw new Error("Lobby config is not an objgen document")
  }
  const previousLobbyVersion = loaded.document.members["ClientVersion"]
  const lobbyNeedsWrite = lobbyFloatToCode(previousLobbyVersion) !== toCode

  if (!overlayNeedsWrite && !lobbyNeedsWrite) {
    return {
      fromCode: before.lobbyCode,
      fromVersion: before.lobbyVersion,
      toCode,
      toVersion,
      overlaySeeded: false,
      overlayWritten: false,
      rehashed: false,
      lobbyApplied: false,
      lobbyRestarted: false,
      alreadyMatched: true,
      message: `Client version already ${toVersion} (code ${toCode}) on lobby and overlay`,
    }
  }

  let lobbyApplied = false
  if (lobbyNeedsWrite) {
    const lobbyDoc: ObjgenDocument = {
      ...loaded.document,
      members: {
        ...loaded.document.members,
        ClientVersion: Number(toVersion),
      },
    }
    await saveConfigDocument("lobby", lobbyDoc)

    const restoreLobbyDraft = async () => {
      try {
        await saveConfigDocument("lobby", {
          ...lobbyDoc,
          members: {
            ...lobbyDoc.members,
            ClientVersion: previousLobbyVersion ?? Number(before.lobbyVersion),
          },
        })
      } catch {
        /* best-effort */
      }
    }

    const validated = await validateLaneAConfigOps(actor, { only: ["lobby"] })
    if (!validated.ok || !validated.releaseId) {
      if (overlayNeedsWrite) await restoreOverlay()
      await restoreLobbyDraft()
      throw new Error(
        validated.detail ||
          validated.error ||
          validated.errors?.join("; ") ||
          "Lobby ClientVersion failed validation"
      )
    }

    const applied = await applyLaneAConfigOps(validated.releaseId, actor, {
      restart: false,
    })
    if (!applied.ok) {
      throw new Error(
        applied.detail ||
          applied.error ||
          applied.errors?.join("; ") ||
          "Overlay version is live but lobby ClientVersion did not copy — use Config → Lobby"
      )
    }
    await markClientVersionRestartPending()
    lobbyApplied = true
  }

  const parts = [
    before.lobbyCode === toCode
      ? `Client version ${toVersion}`
      : `Client version ${before.lobbyVersion} → ${toVersion}`,
    overlayNeedsWrite
      ? overlaySeeded
        ? "seeded overlay/comp_client.xml"
        : "updated overlay/comp_client.xml"
      : null,
    rehashed ? "updater list refreshed" : null,
    lobbyApplied
      ? "lobby ClientVersion saved — restart login from Overview when players should use it"
      : "lobby ClientVersion already matched",
  ].filter(Boolean)

  return {
    fromCode: before.lobbyCode,
    fromVersion: before.lobbyVersion,
    toCode,
    toVersion,
    overlaySeeded: overlayNeedsWrite && overlaySeeded,
    overlayWritten: overlayNeedsWrite,
    rehashed,
    lobbyApplied,
    lobbyRestarted: false,
    alreadyMatched: false,
    message: parts.join(" — "),
  }
}

export type BumpClientVersionResult = ApplyPairedClientVersionResult

export async function bumpClientVersion(
  actor?: string
): Promise<BumpClientVersionResult> {
  const before = await getClientVersionStatus()
  return applyPairedClientVersion(before.nextCode, actor)
}

export async function syncClientVersionToHigher(
  actor?: string,
  opts?: { hintCode?: number; xml?: string }
): Promise<ApplyPairedClientVersionResult> {
  const hintCode = opts?.hintCode
  if (hintCode != null && (!Number.isInteger(hintCode) || hintCode < 1)) {
    throw new Error("hintCode must be a positive integer")
  }
  const xml = opts?.xml?.trim()
  if (xml) {
    if (Buffer.byteLength(xml, "utf8") > MAX_COMP_CLIENT_BYTES) {
      throw new Error(`XML is too large (max ${MAX_COMP_CLIENT_BYTES} bytes)`)
    }
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    const parseError = doc.getElementsByTagName("parsererror")[0]
    if (parseError) throw new Error("Not valid XML")
    const root = doc.documentElement
    if (!root || root.tagName.toLowerCase() !== "config") {
      throw new Error("Root element must be <config>")
    }
  }

  const before = await getClientVersionStatus()
  const xmlCode = xml ? parseCompClientVersion(xml) : null
  const toCode = Math.max(
    before.lobbyCode,
    before.overlayCode ?? 0,
    xmlCode ?? 0,
    hintCode ?? 0
  )
  if (toCode < 1) {
    throw new Error("Could not determine a client version to sync")
  }
  return applyPairedClientVersion(toCode, actor, xml || undefined)
}

export type SaveCompClientResult = {
  versionCode: number
  version: string
  overlaySeeded: boolean
  lobbySynced: boolean
  lobbyRestarted: boolean
  rehashed: boolean
  message: string
}

/**
 * Save the pasted overlay XML as-is (patches, compressors, comments).
 * Refreshes ImagineUpdate. If `<version>` differs from lobby ClientVersion,
 * copies that into lobby config. Does not restart login — Overview does.
 */
export async function saveCompClientXml(
  xml: string,
  actor?: string
): Promise<SaveCompClientResult> {
  const trimmed = xml.trim() + "\n"
  const { versionCode } = validateCompClientXml(trimmed)
  const version = formatLobbyVersion(versionCode)
  const overlayPath = overlayCompClientPath()
  const previous = await readCompClientXml()
  const overlaySeeded = !previous.exists

  await fs.mkdir(path.dirname(overlayPath), { recursive: true })
  await fs.writeFile(overlayPath, trimmed, "utf8")

  const rehash = await publishOpsLaneB(actor)
  if (!rehash.ok) {
    try {
      if (overlaySeeded) await fs.unlink(overlayPath)
      else await fs.writeFile(overlayPath, previous.xml, "utf8")
    } catch {
      /* best-effort */
    }
    throw new Error(
      rehash.detail ||
        rehash.error ||
        "Saved XML but ImagineUpdate list refresh failed"
    )
  }

  const before = await getClientVersionStatus()
  let lobbySynced = false
  if (before.lobbyCode !== versionCode) {
    const loaded = await loadConfigDocument("lobby")
    if (loaded.document.kind !== "objgen") {
      throw new Error(
        "Overlay saved, but lobby config is not objgen — set ClientVersion in Config → Lobby"
      )
    }
    await saveConfigDocument("lobby", {
      ...loaded.document,
      members: {
        ...loaded.document.members,
        ClientVersion: Number(version),
      },
    })
    const validated = await validateLaneAConfigOps(actor, { only: ["lobby"] })
    if (!validated.ok || !validated.releaseId) {
      throw new Error(
        validated.detail ||
          validated.error ||
          validated.errors?.join("; ") ||
          "Overlay saved, but lobby ClientVersion failed validation"
      )
    }
    const applied = await applyLaneAConfigOps(validated.releaseId, actor, {
      restart: false,
    })
    if (!applied.ok) {
      throw new Error(
        applied.detail ||
          applied.error ||
          applied.errors?.join("; ") ||
          "Overlay saved; set ClientVersion in Config → Lobby if login still mismatches"
      )
    }
    lobbySynced = true
    await markClientVersionRestartPending()
  }

  const parts = [
    overlaySeeded ? "Saved overlay/comp_client.xml" : "Updated overlay/comp_client.xml",
    `version ${version} (${versionCode})`,
    "updater list refreshed",
    lobbySynced
      ? "lobby ClientVersion saved — restart login from Overview when players should use it"
      : "lobby ClientVersion already matched",
  ]

  return {
    versionCode,
    version,
    overlaySeeded,
    lobbySynced,
    lobbyRestarted: false,
    rehashed: true,
    message: parts.join(" — "),
  }
}
