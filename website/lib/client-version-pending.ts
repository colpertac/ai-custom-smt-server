import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

function runtimeDir(): string {
  if (process.env.OPS_RUNTIME?.trim()) {
    return path.resolve(process.env.OPS_RUNTIME.trim())
  }
  return path.resolve(REPO_ROOT, "../comp_hack/runtime")
}

function clientVersionRestartPendingPath(): string {
  if (process.env.OPS_RELEASES_DIR?.trim()) {
    return path.join(
      path.resolve(process.env.OPS_RELEASES_DIR.trim()),
      "client-version.restart-pending"
    )
  }
  return path.join(
    runtimeDir(),
    "releases",
    "lane-a",
    "client-version.restart-pending"
  )
}

/** Lobby must reload ClientVersion from lobby.xml. Cleared on lobby restart. */
export async function markClientVersionRestartPending(): Promise<void> {
  const stamp = clientVersionRestartPendingPath()
  await fs.mkdir(path.dirname(stamp), { recursive: true })
  await fs.writeFile(stamp, `${new Date().toISOString()}\n`, "utf8")
}

export async function clearClientVersionRestartPending(): Promise<void> {
  try {
    await fs.unlink(clientVersionRestartPendingPath())
  } catch {
    /* missing ok */
  }
}

export async function isClientVersionRestartPending(): Promise<boolean> {
  try {
    await fs.access(clientVersionRestartPendingPath())
    return true
  } catch {
    return false
  }
}
