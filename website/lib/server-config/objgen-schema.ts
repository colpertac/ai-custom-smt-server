import { promises as fs } from "node:fs"
import path from "node:path"

import { DOMParser } from "@xmldom/xmldom"

import type { FieldDef, FieldKind } from "./types.ts"

type XmlNode = {
  nodeType: number
  nodeValue: string | null
  childNodes: ArrayLike<XmlNode>
  tagName?: string
  getAttribute?: (name: string) => string | null
}

type XmlElement = XmlNode & {
  tagName: string
  getAttribute: (name: string) => string | null
}

function childrenOf(el: XmlElement, tag: string): XmlElement[] {
  const out: XmlElement[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 1 && n.tagName === tag) out.push(n as XmlElement)
  }
  return out
}

function textOf(el: XmlElement): string {
  let out = ""
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 3) out += n.nodeValue ?? ""
  }
  return out.trim()
}

function parseNumAttr(el: XmlElement, name: string): number | undefined {
  const raw = el.getAttribute(name)
  if (raw == null || raw === "") return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function classifyType(typeName: string): {
  kind: FieldKind
  pointer: boolean
  bare: string
} {
  const pointer = typeName.endsWith("*")
  const bare = pointer ? typeName.slice(0, -1) : typeName
  if (bare === "string") return { kind: "string", pointer, bare }
  if (bare === "bool") return { kind: "bool", pointer, bare }
  if (bare === "float" || bare === "f32" || bare === "f64") {
    return { kind: "number", pointer, bare }
  }
  if (/^[su]?(8|16|32|64)$/.test(bare)) {
    return { kind: "number", pointer, bare }
  }
  if (bare === "enum") return { kind: "enum", pointer, bare }
  if (bare === "list") return { kind: "list", pointer, bare }
  if (bare === "array") return { kind: "array", pointer, bare }
  if (bare === "map") return { kind: "map", pointer, bare }
  // Named object type
  return { kind: "object", pointer, bare }
}

type RawObject = {
  name: string
  base?: string
  members: XmlElement[]
}

function parseSchemaFile(xml: string): RawObject[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  const root = doc.documentElement
  if (!root || root.tagName !== "objgen") return []
  const objects: RawObject[] = []
  for (const obj of childrenOf(root as XmlElement, "object")) {
    const name = obj.getAttribute("name")
    if (!name) continue
    objects.push({
      name,
      base: obj.getAttribute("baseobject") || undefined,
      members: childrenOf(obj, "member"),
    })
  }
  return objects
}

export type SchemaRegistry = {
  objects: Map<string, FieldDef[]>
}

function resolveObjectFields(
  objectName: string,
  registry: SchemaRegistry,
  rawObjects: Map<string, RawObject>,
  resolving: Set<string>
): FieldDef[] {
  if (resolving.has(objectName)) return []
  const cached = registry.objects.get(objectName)
  if (cached && cached.length) return cached
  if (cached && resolving.has(objectName)) return cached

  resolving.add(objectName)
  registry.objects.set(objectName, [])

  const raw = rawObjects.get(objectName)
  if (!raw) {
    resolving.delete(objectName)
    return []
  }

  const byName = new Map<string, FieldDef>()
  if (raw.base) {
    for (const f of resolveObjectFields(
      raw.base,
      registry,
      rawObjects,
      resolving
    )) {
      byName.set(f.name, f)
    }
  }
  for (const mel of raw.members) {
    const f = memberToField(mel, registry, rawObjects, resolving)
    if (!f) continue
    const prev = byName.get(f.name)
    byName.set(f.name, prev ? { ...prev, ...f, inherited: prev.inherited } : f)
  }
  const fields = [...byName.values()]
  registry.objects.set(objectName, fields)
  resolving.delete(objectName)
  return fields
}

function memberToField(
  el: XmlElement,
  registry: SchemaRegistry,
  rawObjects: Map<string, RawObject>,
  resolving: Set<string>
): FieldDef | null {
  const name = el.getAttribute("name")
  if (!name) return null
  const typeName = el.getAttribute("type") || "string"
  const { kind, pointer, bare } = classifyType(typeName)
  const defaultVal = el.getAttribute("default")
  const inherited = el.getAttribute("inherited") === "true"
  const min = parseNumAttr(el, "min")
  const max = parseNumAttr(el, "max")
  const regex = el.getAttribute("regex") || undefined

  const field: FieldDef = {
    name,
    kind,
    typeName,
    default: defaultVal ?? undefined,
    // COMP configs omit members freely; defaults apply in C++. Only validate
    // present values (min/max/enum/regex) — do not require every schema member.
    required: false,
    inherited: inherited || undefined,
    min,
    max,
    pointer: pointer || undefined,
    regex: regex || undefined,
  }

  if (kind === "enum") {
    field.enumValues = childrenOf(el, "value").map((v) => textOf(v))
  }

  if (kind === "list" || kind === "array") {
    const elementEl = childrenOf(el, "element")[0]
    if (elementEl) {
      const et = elementEl.getAttribute("type") || "string"
      const classified = classifyType(et)
      const elem: FieldDef = {
        name: "element",
        kind: classified.kind === "object" ? "object" : classified.kind,
        typeName: et,
        required: false,
      }
      if (classified.kind === "enum") {
        elem.enumValues = childrenOf(elementEl, "value").map((v) => textOf(v))
        elem.kind = "enum"
      }
      if (classified.kind === "object") {
        elem.children = resolveObjectFields(
          classified.bare,
          registry,
          rawObjects,
          resolving
        )
        elem.kind = "object"
      }
      field.element = elem
    }
    if (kind === "array") {
      field.arraySize = parseNumAttr(el, "size")
    }
    field.required = false
  }

  if (kind === "map") {
    const keyEl = childrenOf(el, "key")[0]
    const valueEl = childrenOf(el, "value")[0]
    field.keyType = keyEl?.getAttribute("type") || "string"
    if (valueEl) {
      const vt = valueEl.getAttribute("type") || "string"
      const classified = classifyType(vt)
      const vf: FieldDef = {
        name: "value",
        kind: classified.kind === "enum" ? "enum" : classified.kind,
        typeName: vt,
        required: false,
      }
      if (valueEl.getAttribute("type") === "enum" || classified.kind === "enum") {
        vf.kind = "enum"
        vf.enumValues = childrenOf(valueEl, "value").map((v) => textOf(v))
      }
      field.valueField = vf
    }
    field.required = false
  }

  if (kind === "object") {
    const inlineOverrides = childrenOf(el, "member")
    let children = resolveObjectFields(bare, registry, rawObjects, resolving)
    if (inlineOverrides.length) {
      const byName = new Map(children.map((c) => [c.name, c]))
      for (const ov of inlineOverrides) {
        const ovField = memberToField(ov, registry, rawObjects, resolving)
        if (!ovField) continue
        const existing = byName.get(ovField.name)
        byName.set(
          ovField.name,
          existing ? { ...existing, ...ovField } : ovField
        )
      }
      children = [...byName.values()]
    }
    field.children = children
    field.required = false
  }

  if (pointer) field.required = false
  return field
}

export async function loadSchemaRegistry(
  schemaPaths: string[]
): Promise<SchemaRegistry> {
  const rawObjects = new Map<string, RawObject>()
  for (const p of schemaPaths) {
    let xml: string
    try {
      xml = await fs.readFile(p, "utf8")
    } catch {
      continue
    }
    for (const obj of parseSchemaFile(xml)) {
      rawObjects.set(obj.name, obj)
    }
  }
  const registry: SchemaRegistry = { objects: new Map() }
  for (const name of rawObjects.keys()) {
    resolveObjectFields(name, registry, rawObjects, new Set())
  }
  return registry
}

export function getObjectFields(
  registry: SchemaRegistry,
  objectName: string
): FieldDef[] {
  return registry.objects.get(objectName) ?? []
}

export function schemaPathsForCompHack(compHackRoot: string): string[] {
  const lib = path.join(compHackRoot, "libcomp", "libcomp", "schema")
  return [
    path.join(lib, "serverconfig.xml"),
    path.join(lib, "databaseconfig.xml"),
    path.join(lib, "databaseconfig_sqlite3.xml"),
    path.join(lib, "databaseconfig_mariadb.xml"),
    path.join(compHackRoot, "server", "lobby", "schema", "lobbyconfig.xml"),
    path.join(compHackRoot, "server", "world", "schema", "worldconfig.xml"),
    path.join(compHackRoot, "server", "channel", "schema", "channelconfig.xml"),
  ]
}

/** Schemas vendored for Docker / Hub images (no full comp_hack tree). */
export function schemaPathsBundled(vendorDir: string): string[] {
  return [
    path.join(vendorDir, "serverconfig.xml"),
    path.join(vendorDir, "databaseconfig.xml"),
    path.join(vendorDir, "databaseconfig_sqlite3.xml"),
    path.join(vendorDir, "databaseconfig_mariadb.xml"),
    path.join(vendorDir, "lobbyconfig.xml"),
    path.join(vendorDir, "worldconfig.xml"),
    path.join(vendorDir, "channelconfig.xml"),
  ]
}

export const OBJGEN_ROOT_OBJECT: Record<
  "lobby" | "world" | "channel",
  string
> = {
  lobby: "LobbyConfig",
  world: "WorldConfig",
  channel: "ChannelConfig",
}
