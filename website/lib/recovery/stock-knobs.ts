import { promises as fs } from "node:fs"
import path from "node:path"

import {
  fieldsForObjgen,
  getLiveConfigDir,
  writeWorkingXml,
} from "@/lib/server-config/fs"
import {
  parseObjgenConfig,
  serializeObjgenConfig,
} from "@/lib/server-config/objgen-config"
import type {
  ConfigValue,
  ObjgenDocument,
} from "@/lib/server-config/types"

import { getStockConfigDir } from "./paths"
import { PRESERVE_FIELDS, type StockKnobFileId } from "./preserve"

function isObject(
  v: ConfigValue
): v is { __kind: "object"; members: Record<string, ConfigValue> } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as { __kind?: string }).__kind === "object"
  )
}

/** Deep-clone JSON-safe ConfigValue trees. */
export function cloneConfigValue(v: ConfigValue): ConfigValue {
  if (v === null || typeof v !== "object") return v
  if (Array.isArray(v)) return v.map(cloneConfigValue)
  if (isObject(v)) {
    const members: Record<string, ConfigValue> = {}
    for (const [k, child] of Object.entries(v.members)) {
      members[k] = cloneConfigValue(child)
    }
    return { __kind: "object", members }
  }
  if ((v as { __kind?: string }).__kind === "map") {
    const map = v as { __kind: "map"; entries: { key: string; value: ConfigValue }[] }
    return {
      __kind: "map",
      entries: map.entries.map((e) => ({
        key: e.key,
        value: cloneConfigValue(e.value),
      })),
    }
  }
  return v
}

/**
 * Start from stock members; overlay identity fields from live.
 * Nested objects (e.g. SQLite3Config) are replaced wholesale from live when preserved.
 */
export function mergeStockWithIdentity(
  stock: Record<string, ConfigValue>,
  live: Record<string, ConfigValue>,
  preserveKeys: readonly string[]
): Record<string, ConfigValue> {
  const out: Record<string, ConfigValue> = {}
  for (const [k, v] of Object.entries(stock)) {
    out[k] = cloneConfigValue(v)
  }
  for (const key of preserveKeys) {
    if (key in live && live[key] !== undefined) {
      out[key] = cloneConfigValue(live[key])
    }
  }
  return out
}

export function preserveKeysFor(id: "lobby" | "world" | "channel"): readonly string[] {
  if (id === "lobby") return PRESERVE_FIELDS.lobby
  if (id === "world") return PRESERVE_FIELDS.world
  return PRESERVE_FIELDS.channel
}

async function readXml(dir: string, filename: string): Promise<string> {
  return fs.readFile(path.join(dir, filename), "utf8")
}

/**
 * Merge stock templates with live identity into working config XMLs.
 * Does not apply/publish — caller runs lane-a-config validate+apply.
 */
export async function writeStockKnobsToWorking(): Promise<{
  files: StockKnobFileId[]
  warnings: string[]
}> {
  const stockDir = getStockConfigDir()
  const liveDir = getLiveConfigDir()
  const warnings: string[] = []
  const files: StockKnobFileId[] = []

  for (const id of ["lobby", "world", "channel"] as const) {
    const filename = `${id}.xml`
    let stockXml: string
    let liveXml: string
    try {
      stockXml = await readXml(stockDir, filename)
    } catch {
      warnings.push(`Missing stock template: ${filename}`)
      continue
    }
    try {
      liveXml = await readXml(liveDir, filename)
    } catch {
      warnings.push(`Missing live config: ${filename} — writing stock as-is`)
      await writeWorkingXml(id, stockXml)
      files.push(id)
      continue
    }

    const fieldDefs = await fieldsForObjgen(id)
    const stockDoc = parseObjgenConfig(stockXml, fieldDefs)
    const liveDoc = parseObjgenConfig(liveXml, fieldDefs)
    const merged: ObjgenDocument = {
      kind: "objgen",
      members: mergeStockWithIdentity(
        stockDoc.members,
        liveDoc.members,
        preserveKeysFor(id)
      ),
      // Keep live passthrough unknowns (custom members) when present.
      passthrough: liveDoc.passthrough.length
        ? liveDoc.passthrough
        : stockDoc.passthrough,
    }
    await writeWorkingXml(id, serializeObjgenConfig(merged))
    files.push(id)
  }

  // constants: copy stock bytes as-is. Do NOT parse/serialize — nested
  // constants (ADJUSTMENT_ITEMS, maps, etc.) lose their child XML in the
  // simple constants parser and lobby then refuses to boot.
  try {
    const stockXml = await readXml(stockDir, "constants.xml")
    if (!stockXml.includes("ADJUSTMENT_ITEMS")) {
      warnings.push(
        "Stock constants.xml looks incomplete (no ADJUSTMENT_ITEMS) — leaving live constants unchanged"
      )
    } else {
      await writeWorkingXml("constants", stockXml.endsWith("\n") ? stockXml : `${stockXml}\n`)
      files.push("constants")
    }
  } catch (e) {
    warnings.push(
      e instanceof Error
        ? `constants.xml stock reset skipped: ${e.message}`
        : "constants.xml stock reset skipped"
    )
  }

  return { files, warnings }
}
