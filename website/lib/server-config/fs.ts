import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"

import { CONFIG_FILES, configMeta, isConfigFileId } from "./catalog.ts"
import {
  parseConstantsXml,
  serializeConstantsXml,
} from "./constants-xml.ts"
import {
  parseNewCharacterXml,
  serializeNewCharacterXml,
} from "./newcharacter-xml.ts"
import {
  coerceObjgenMembers,
  parseObjgenConfig,
  serializeObjgenConfig,
} from "./objgen-config.ts"
import {
  getObjectFields,
  loadSchemaRegistry,
  OBJGEN_ROOT_OBJECT,
  schemaPathsForCompHack,
  type SchemaRegistry,
} from "./objgen-schema.ts"
import { parseSetupXml, serializeSetupXml } from "./setup-xml.ts"
import {
  assertNoValidationErrors,
  ConfigValidationError,
  validateConfigDocument,
  type ValidationIssue,
} from "./validate.ts"
import type {
  ConfigDocument,
  ConfigFileId,
  ConfigFileStatus,
  ConfigValue,
  ConstantsDocument,
  FieldDef,
  NewCharacterDocument,
  ObjgenDocument,
  SetupDocument,
} from "./types.ts"

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../../..")

let schemaCache: SchemaRegistry | null = null

export function clearSchemaCache(): void {
  schemaCache = null
}

export function getCompHackRoot(): string {
  if (process.env.COMP_HACK_ROOT?.trim()) {
    return path.resolve(process.env.COMP_HACK_ROOT.trim())
  }
  return path.resolve(REPO_ROOT, "../comp_hack")
}

export function getRuntimeDir(): string {
  if (process.env.OPS_RUNTIME?.trim()) {
    return path.resolve(process.env.OPS_RUNTIME.trim())
  }
  return path.join(getCompHackRoot(), "runtime")
}

export function getLiveConfigDir(): string {
  if (process.env.COMP_CONFIG_LIVE_DIR?.trim()) {
    return path.resolve(process.env.COMP_CONFIG_LIVE_DIR.trim())
  }
  return path.join(getRuntimeDir(), "config")
}

export function getWorkingConfigDir(): string {
  if (process.env.COMP_CONFIG_DIR?.trim()) {
    return path.resolve(process.env.COMP_CONFIG_DIR.trim())
  }
  return path.join(REPO_ROOT, "server-content", "config")
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function fileDigest(p: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(p)
    return createHash("sha256").update(buf).digest("hex")
  } catch {
    return null
  }
}

export async function getSchemaRegistry(): Promise<SchemaRegistry> {
  if (schemaCache) return schemaCache
  schemaCache = await loadSchemaRegistry(
    schemaPathsForCompHack(getCompHackRoot())
  )
  return schemaCache
}

export function fieldsForObjgen(id: "lobby" | "world" | "channel"): Promise<FieldDef[]> {
  return getSchemaRegistry().then((reg) =>
    getObjectFields(reg, OBJGEN_ROOT_OBJECT[id])
  )
}

export async function listConfigStatus(): Promise<ConfigFileStatus[]> {
  const working = getWorkingConfigDir()
  const live = getLiveConfigDir()
  const out: ConfigFileStatus[] = []
  for (const meta of CONFIG_FILES) {
    const w = path.join(working, meta.filename)
    const l = path.join(live, meta.filename)
    const workingExists = await pathExists(w)
    const liveExists = await pathExists(l)
    let dirty = false
    if (workingExists && liveExists) {
      const [a, b] = await Promise.all([fileDigest(w), fileDigest(l)])
      dirty = Boolean(a && b && a !== b)
    } else if (workingExists !== liveExists) {
      dirty = workingExists
    }
    out.push({
      id: meta.id,
      filename: meta.filename,
      label: meta.label,
      description: meta.description,
      editor: meta.editor,
      requiredToRun: meta.requiredToRun,
      workingExists,
      liveExists,
      dirty,
    })
  }
  return out
}

/** Copy live → working for any missing working files. */
export async function seedWorkingFromLive(
  ids?: ConfigFileId[]
): Promise<{ seeded: string[]; skipped: string[] }> {
  const working = getWorkingConfigDir()
  const live = getLiveConfigDir()
  await fs.mkdir(working, { recursive: true })
  const seeded: string[] = []
  const skipped: string[] = []
  const targets = ids?.length
    ? CONFIG_FILES.filter((f) => ids.includes(f.id))
    : CONFIG_FILES
  for (const meta of targets) {
    const w = path.join(working, meta.filename)
    const l = path.join(live, meta.filename)
    if (await pathExists(w)) {
      skipped.push(meta.filename)
      continue
    }
    if (!(await pathExists(l))) {
      skipped.push(meta.filename)
      continue
    }
    await fs.copyFile(l, w)
    seeded.push(meta.filename)
  }
  return { seeded, skipped }
}

export async function readWorkingXml(id: ConfigFileId): Promise<string> {
  const meta = configMeta(id)
  if (!meta) throw new Error(`Unknown config: ${id}`)
  const p = path.join(getWorkingConfigDir(), meta.filename)
  try {
    return await fs.readFile(p, "utf8")
  } catch {
    const live = path.join(getLiveConfigDir(), meta.filename)
    return await fs.readFile(live, "utf8")
  }
}

export async function writeWorkingXml(
  id: ConfigFileId,
  xml: string
): Promise<void> {
  const meta = configMeta(id)
  if (!meta) throw new Error(`Unknown config: ${id}`)
  const dir = getWorkingConfigDir()
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, meta.filename), xml, "utf8")
}

export async function loadConfigDocument(
  id: ConfigFileId
): Promise<{ document: ConfigDocument; fields?: FieldDef[]; xml: string }> {
  const meta = configMeta(id)
  if (!meta) throw new Error(`Unknown config: ${id}`)
  await seedWorkingFromLive([id])
  const xml = await readWorkingXml(id)

  if (meta.editor === "constants") {
    return { document: parseConstantsXml(xml), xml }
  }
  if (meta.editor === "setup") {
    return { document: parseSetupXml(xml), xml }
  }
  if (meta.editor === "newcharacter") {
    return { document: parseNewCharacterXml(xml), xml }
  }

  const fields = await fieldsForObjgen(id as "lobby" | "world" | "channel")
  return {
    document: parseObjgenConfig(xml, fields),
    fields,
    xml,
  }
}

export async function saveConfigDocument(
  id: ConfigFileId,
  body: unknown
): Promise<{ warnings: ValidationIssue[] }> {
  const meta = configMeta(id)
  if (!meta) throw new Error(`Unknown config: ${id}`)

  if (meta.editor === "constants") {
    const doc = body as ConstantsDocument
    if (doc.kind !== "constants" || !Array.isArray(doc.entries)) {
      throw new Error("Invalid constants payload")
    }
    const issues = validateConfigDocument(doc)
    assertNoValidationErrors(issues)
    await writeWorkingXml(id, serializeConstantsXml(doc))
    return { warnings: issues.filter((i) => i.severity === "warning") }
  }

  if (meta.editor === "setup") {
    const doc = body as SetupDocument
    if (doc.kind !== "setup" || !Array.isArray(doc.accounts)) {
      throw new Error("Invalid setup payload")
    }
    const issues = validateConfigDocument(doc)
    assertNoValidationErrors(issues)
    await writeWorkingXml(id, serializeSetupXml(doc))
    return { warnings: issues.filter((i) => i.severity === "warning") }
  }

  if (meta.editor === "newcharacter") {
    const doc = body as NewCharacterDocument
    if (doc.kind !== "newcharacter") {
      throw new Error("Invalid newcharacter payload")
    }
    const issues = validateConfigDocument(doc)
    assertNoValidationErrors(issues)
    await writeWorkingXml(id, serializeNewCharacterXml(doc))
    return { warnings: issues.filter((i) => i.severity === "warning") }
  }

  const fields = await fieldsForObjgen(id as "lobby" | "world" | "channel")
  const raw = body as {
    kind?: string
    members?: Record<string, unknown>
    passthrough?: { name: string; content: string }[]
  }
  if (!raw.members || typeof raw.members !== "object") {
    throw new Error("Invalid objgen payload")
  }
  const doc: ObjgenDocument = {
    kind: "objgen",
    members: coerceObjgenMembers(raw.members, fields),
    passthrough: Array.isArray(raw.passthrough) ? raw.passthrough : [],
  }
  const issues = validateConfigDocument(doc, fields)
  assertNoValidationErrors(issues)
  await writeWorkingXml(id, serializeObjgenConfig(doc))
  return { warnings: issues.filter((i) => i.severity === "warning") }
}

export { ConfigValidationError }
export type { ValidationIssue }

/** Flatten object values for the UI (unwrap __kind wrappers for JSON). */
export function documentForClient(
  doc: ConfigDocument,
  fields?: FieldDef[]
): {
  document: ConfigDocument
  fields?: FieldDef[]
} {
  return { document: doc, fields }
}

export function assertConfigId(id: string): ConfigFileId {
  if (!isConfigFileId(id)) throw new Error(`Unknown config id: ${id}`)
  return id
}

export type { ConfigValue }
