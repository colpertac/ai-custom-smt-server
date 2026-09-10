import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  applyWebGameSettings,
  parseWebGameSettings,
  WebGameParseError,
} from "./webgames-parse.ts"
import {
  WEBGAME_IDS,
  type WebGameFilePayload,
  type WebGameId,
  type WebGameSettingsMap,
} from "./webgames-types.ts"

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

function runtimeDir(): string {
  if (process.env.OPS_RUNTIME?.trim()) {
    return path.resolve(process.env.OPS_RUNTIME.trim())
  }
  return path.resolve(REPO_ROOT, "../comp_hack/runtime")
}

export class WebGameConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebGameConfigError"
  }
}

export function isWebGameId(value: string): value is WebGameId {
  return (WEBGAME_IDS as readonly string[]).includes(value)
}

/** Live lobby datastore copy (PhysicsFS / OPS_RUNTIME). */
export function getWebGamePath(game: WebGameId): string {
  if (process.env.COMP_WEBGAMES_DIR?.trim()) {
    return path.join(path.resolve(process.env.COMP_WEBGAMES_DIR.trim()), `${game}.nut`)
  }
  const datastore = process.env.COMP_DATASTORE_DIR?.trim()
  if (datastore) {
    return path.join(path.resolve(datastore), "webgames", `${game}.nut`)
  }
  return path.join(runtimeDir(), "datastore/webgames", `${game}.nut`)
}

/** Repo / deploy mirror — kept in sync when live path differs. */
export function getWebGameMirrorPath(game: WebGameId): string {
  return path.join(
    REPO_ROOT,
    "deploy/data/datastore/webgames",
    `${game}.nut`
  )
}

function casinoRestartPendingPath(): string {
  if (process.env.OPS_RELEASES_DIR?.trim()) {
    return path.join(
      path.resolve(process.env.OPS_RELEASES_DIR.trim()),
      "casino-webgames.restart-pending"
    )
  }
  return path.join(
    runtimeDir(),
    "releases",
    "lane-a",
    "casino-webgames.restart-pending"
  )
}

/** Lobby must reload /webgames scripts for casino edits. */
export async function markCasinoRestartPending(): Promise<void> {
  const stamp = casinoRestartPendingPath()
  await fs.mkdir(path.dirname(stamp), { recursive: true })
  await fs.writeFile(stamp, `${new Date().toISOString()}\n`, "utf8")
}

export async function clearCasinoRestartPending(): Promise<void> {
  try {
    await fs.unlink(casinoRestartPendingPath())
  } catch {
    /* missing ok */
  }
}

export async function isCasinoRestartPending(): Promise<boolean> {
  try {
    await fs.access(casinoRestartPendingPath())
    return true
  } catch {
    return false
  }
}

async function readWebGameSource(game: WebGameId): Promise<string> {
  const filePath = getWebGamePath(game)
  try {
    return await fs.readFile(filePath, "utf8")
  } catch (error) {
    throw new WebGameConfigError(
      `Cannot read casino script at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

async function writeWebGameSource(game: WebGameId, source: string): Promise<void> {
  const filePath = getWebGamePath(game)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, source, "utf8")

  const mirror = getWebGameMirrorPath(game)
  if (path.resolve(mirror) !== path.resolve(filePath)) {
    try {
      await fs.mkdir(path.dirname(mirror), { recursive: true })
      await fs.writeFile(mirror, source, "utf8")
    } catch {
      /* mirror is best-effort */
    }
  }

  await markCasinoRestartPending()
}

export async function readWebGameFile<T extends WebGameId>(
  game: T
): Promise<WebGameFilePayload<T>> {
  const source = await readWebGameSource(game)
  try {
    const settings = parseWebGameSettings(game, source)
    return {
      game,
      path: getWebGamePath(game),
      settings,
      restartPending: await isCasinoRestartPending(),
    }
  } catch (error) {
    if (error instanceof WebGameParseError) {
      throw new WebGameConfigError(error.message)
    }
    throw error
  }
}

export async function listWebGameFiles(): Promise<{
  restartPending: boolean
  games: WebGameFilePayload[]
}> {
  const restartPending = await isCasinoRestartPending()
  const games = await Promise.all(
    WEBGAME_IDS.map(async (game) => {
      const file = await readWebGameFile(game)
      return { ...file, restartPending }
    })
  )
  return { restartPending, games }
}

export async function updateWebGameSettings<T extends WebGameId>(
  game: T,
  settings: WebGameSettingsMap[T]
): Promise<WebGameFilePayload<T>> {
  const source = await readWebGameSource(game)
  let next: string
  try {
    next = applyWebGameSettings(game, source, settings)
  } catch (error) {
    if (error instanceof WebGameParseError) {
      throw new WebGameConfigError(error.message)
    }
    throw error
  }
  await writeWebGameSource(game, next)
  return readWebGameFile(game)
}
