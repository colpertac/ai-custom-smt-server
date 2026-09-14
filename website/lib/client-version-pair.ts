import {
  DEFAULT_CLIENT_VERSION_CODE,
  DEFAULT_COMP_CLIENT_XML,
} from "@/lib/client-version-default"

export {
  DEFAULT_CLIENT_VERSION_CODE,
  DEFAULT_COMP_CLIENT_XML,
} from "@/lib/client-version-default"

const VERSION_TAG = /<version>\s*(\d+)\s*<\/version>/i

export function formatLobbyVersion(code: number): string {
  return (code / 1000).toFixed(3)
}

export function lobbyFloatToCode(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 1000)
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim())
    if (Number.isFinite(n)) return Math.round(n * 1000)
  }
  return DEFAULT_CLIENT_VERSION_CODE
}

export function parseCompClientVersion(xml: string): number | null {
  const match = VERSION_TAG.exec(xml)
  if (!match) return null
  const code = Number(match[1])
  return Number.isInteger(code) && code > 0 ? code : null
}

export function setCompClientVersion(xml: string, code: number): string {
  const tag = `<version>${code}</version>`
  if (VERSION_TAG.test(xml)) {
    return xml.replace(VERSION_TAG, tag)
  }
  if (/<\/config>/i.test(xml)) {
    return xml.replace(/<\/config>/i, `    ${tag}\n</config>`)
  }
  return setCompClientVersion(DEFAULT_COMP_CLIENT_XML, code)
}

export type ClientVersionMismatchReason =
  | "ok"
  | "overlay_missing"
  | "overlay_no_version"
  | "codes_differ"

export type ClientVersionMismatch = {
  mismatched: boolean
  reason: ClientVersionMismatchReason
  lobbyCode: number
  lobbyVersion: string
  overlayCode: number | null
  overlayExists: boolean
  targetCode: number
  targetVersion: string
}

/**
 * Overlay `<version>` integer must equal lobby ClientVersion × 1000.
 * Target is the higher of the two when both exist.
 */
export function describeClientVersionMismatch(input: {
  lobbyCode: number
  overlayCode: number | null
  overlayExists: boolean
}): ClientVersionMismatch {
  const lobbyCode =
    input.lobbyCode > 0 ? input.lobbyCode : DEFAULT_CLIENT_VERSION_CODE
  const lobbyVersion = formatLobbyVersion(lobbyCode)
  const overlayCode = input.overlayCode
  const overlayExists = input.overlayExists

  if (overlayCode == null) {
    const reason: ClientVersionMismatchReason = overlayExists
      ? "overlay_no_version"
      : "overlay_missing"
    return {
      mismatched: true,
      reason,
      lobbyCode,
      lobbyVersion,
      overlayCode: null,
      overlayExists,
      targetCode: lobbyCode,
      targetVersion: lobbyVersion,
    }
  }

  if (overlayCode !== lobbyCode) {
    const targetCode = Math.max(lobbyCode, overlayCode)
    return {
      mismatched: true,
      reason: "codes_differ",
      lobbyCode,
      lobbyVersion,
      overlayCode,
      overlayExists,
      targetCode,
      targetVersion: formatLobbyVersion(targetCode),
    }
  }

  return {
    mismatched: false,
    reason: "ok",
    lobbyCode,
    lobbyVersion,
    overlayCode,
    overlayExists,
    targetCode: lobbyCode,
    targetVersion: lobbyVersion,
  }
}
