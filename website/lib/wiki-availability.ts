import { existsSync } from "node:fs"
import path from "node:path"

/**
 * Wiki is gated until BinaryData is present on the game volume.
 * Local next/tests (no OPS_RUNTIME / COMP_RUNTIME) keep the bundled catalog.
 */
export function isWikiAvailable(): boolean {
  const force = process.env.WIKI_FORCE?.trim()
  if (force === "1" || force === "true") return true
  if (force === "0" || force === "false") return false

  const runtime =
    process.env.OPS_RUNTIME?.trim() || process.env.COMP_RUNTIME?.trim()
  if (!runtime) {
    // Dev / unit tests — no game volume mounted.
    return true
  }

  const shield = path.join(
    path.resolve(runtime),
    "datastore",
    "BinaryData",
    "Shield"
  )
  return (
    existsSync(path.join(shield, "ItemData.sbin")) ||
    existsSync(path.join(shield, "ItemData.bin"))
  )
}
