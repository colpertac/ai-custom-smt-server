import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { WEBGAME_IDS, type WebGameId } from "./webgames-types.ts"

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

export const CASINO_SWF_MAX_BYTES = 8 * 1024 * 1024

export const CASINO_SWF_FILES: Record<
  WebGameId,
  { fileName: string; label: string }
> = {
  slot: { fileName: "Slots.swf", label: "Slots" },
  roulette: { fileName: "Roulette.swf", label: "Roulette" },
  kino: { fileName: "Kino.swf", label: "Kino" },
}

export type CasinoFlashAssetStatus = {
  game: WebGameId
  label: string
  fileName: string
  present: boolean
  sizeBytes: number | null
  path: string
}

export class CasinoFlashError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CasinoFlashError"
  }
}

function runtimeDir(): string {
  if (process.env.OPS_RUNTIME?.trim()) {
    return path.resolve(process.env.OPS_RUNTIME.trim())
  }
  return path.resolve(REPO_ROOT, "../comp_hack/runtime")
}

/** Live lobby WebRoot casino folder. */
export function getCasinoWebRootDir(): string {
  if (process.env.COMP_WEBROOT_DIR?.trim()) {
    return path.join(path.resolve(process.env.COMP_WEBROOT_DIR.trim()), "casino")
  }
  return path.join(runtimeDir(), "webroot/casino")
}

export function getCasinoWebRootMirrorDir(): string {
  return path.join(REPO_ROOT, "deploy/data/webroot/casino")
}

export function getCasinoSwfPath(game: WebGameId): string {
  return path.join(
    getCasinoWebRootDir(),
    game,
    CASINO_SWF_FILES[game].fileName
  )
}

function getCasinoSwfMirrorPath(game: WebGameId): string {
  return path.join(
    getCasinoWebRootMirrorDir(),
    game,
    CASINO_SWF_FILES[game].fileName
  )
}

function looksLikeSwf(bytes: Buffer): boolean {
  if (bytes.length < 3) return false
  const sig = bytes.subarray(0, 3).toString("ascii")
  return sig === "FWS" || sig === "CWS" || sig === "ZWS"
}

export function guessCasinoGameFromFileName(
  name: string
): WebGameId | null {
  const lower = name.trim().toLowerCase()
  if (lower === "slots.swf" || lower === "slot.swf") return "slot"
  if (lower === "roulette.swf") return "roulette"
  if (lower === "kino.swf") return "kino"
  return null
}

async function statAsset(game: WebGameId): Promise<CasinoFlashAssetStatus> {
  const meta = CASINO_SWF_FILES[game]
  const filePath = getCasinoSwfPath(game)
  try {
    const st = await fs.stat(filePath)
    return {
      game,
      label: meta.label,
      fileName: meta.fileName,
      present: st.isFile() && st.size > 0,
      sizeBytes: st.isFile() ? st.size : null,
      path: filePath,
    }
  } catch {
    return {
      game,
      label: meta.label,
      fileName: meta.fileName,
      present: false,
      sizeBytes: null,
      path: filePath,
    }
  }
}

export async function listCasinoFlashAssets(): Promise<{
  webRoot: string
  ready: boolean
  assets: CasinoFlashAssetStatus[]
}> {
  const assets = await Promise.all(WEBGAME_IDS.map((g) => statAsset(g)))
  return {
    webRoot: getCasinoWebRootDir(),
    ready: assets.every((a) => a.present),
    assets,
  }
}

export async function writeCasinoSwf(
  game: WebGameId,
  bytes: Buffer
): Promise<CasinoFlashAssetStatus> {
  if (bytes.length <= 0) {
    throw new CasinoFlashError("Empty file")
  }
  if (bytes.length > CASINO_SWF_MAX_BYTES) {
    throw new CasinoFlashError("File too large (max 8 MiB)")
  }
  if (!looksLikeSwf(bytes)) {
    throw new CasinoFlashError(
      "Not a Flash .swf file (expected FWS/CWS/ZWS header)"
    )
  }

  const live = getCasinoSwfPath(game)
  await fs.mkdir(path.dirname(live), { recursive: true })
  await fs.writeFile(live, bytes)

  const mirror = getCasinoSwfMirrorPath(game)
  if (path.resolve(mirror) !== path.resolve(live)) {
    try {
      await fs.mkdir(path.dirname(mirror), { recursive: true })
      await fs.writeFile(mirror, bytes)
    } catch {
      /* mirror best-effort */
    }
  }

  return statAsset(game)
}
