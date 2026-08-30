import { DOMParser, XMLSerializer } from "@xmldom/xmldom"

import type {
  ConfigMap,
  ConfigObject,
  ConfigValue,
  FieldDef,
  ObjgenDocument,
} from "./types.ts"

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

const serializer = new XMLSerializer()

function childrenOf(el: XmlElement, tag: string): XmlElement[] {
  const out: XmlElement[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 1 && n.tagName === tag) out.push(n as XmlElement)
  }
  return out
}

function firstChild(el: XmlElement, tag: string): XmlElement | null {
  return childrenOf(el, tag)[0] ?? null
}

function textContent(el: XmlElement): string {
  let out = ""
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 3) out += n.nodeValue ?? ""
    else if (n.nodeType === 1) {
      out += serializer.serializeToString(n as never)
    }
  }
  return out
}

function memberIsComplex(el: XmlElement): boolean {
  for (let i = 0; i < el.childNodes.length; i++) {
    if (el.childNodes[i].nodeType === 1) return true
  }
  return false
}

function directMembers(parent: XmlElement): XmlElement[] {
  return childrenOf(parent, "member")
}

function parseScalar(text: string, field?: FieldDef): ConfigValue {
  const t = text.trim()
  if (!field) return t
  if (field.kind === "bool") {
    if (t === "true" || t === "1") return true
    if (t === "false" || t === "0") return false
    return t === "" ? null : t
  }
  if (field.kind === "number") {
    if (t === "") return null
    const n = Number(t)
    return Number.isFinite(n) ? n : t
  }
  return t
}

function parseMemberValue(el: XmlElement, field?: FieldDef): ConfigValue {
  if (!memberIsComplex(el)) {
    return parseScalar(textContent(el), field)
  }

  const pairs = childrenOf(el, "pair")
  if (pairs.length || field?.kind === "map") {
    const entries = pairs.map((pair) => {
      const keyEl = firstChild(pair, "key")
      const valueEl = firstChild(pair, "value")
      return {
        key: keyEl ? textContent(keyEl).trim() : "",
        value: valueEl
          ? memberIsComplex(valueEl)
            ? parseMemberValue(valueEl, field?.valueField)
            : parseScalar(textContent(valueEl), field?.valueField)
          : "",
      }
    })
    return { __kind: "map", entries } satisfies ConfigMap
  }

  const elements = childrenOf(el, "element")
  if (elements.length || field?.kind === "list" || field?.kind === "array") {
    return elements.map((elem) => {
      if (memberIsComplex(elem)) {
        const obj = firstChild(elem, "object")
        if (obj) {
          return parseObjectMembers(obj, field?.element?.children)
        }
        return parseMemberValue(elem, field?.element)
      }
      return parseScalar(textContent(elem), field?.element)
    })
  }

  const obj = firstChild(el, "object")
  if (obj) {
    return parseObjectMembers(obj, field?.children)
  }

  // Fallback: treat as opaque string of inner XML
  return textContent(el).trim()
}

function parseObjectMembers(
  obj: XmlElement,
  fields?: FieldDef[]
): ConfigObject {
  const fieldByName = new Map((fields ?? []).map((f) => [f.name, f]))
  const members: Record<string, ConfigValue> = {}
  for (const m of directMembers(obj)) {
    const name = m.getAttribute("name")
    if (!name) continue
    members[name] = parseMemberValue(m, fieldByName.get(name))
  }
  return { __kind: "object", members }
}

export function parseObjgenConfig(
  xml: string,
  fields: FieldDef[]
): ObjgenDocument {
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  const root = doc.documentElement
  if (!root || root.tagName !== "objgen") {
    throw new Error("Not an objgen document")
  }
  const objects = childrenOf(root as XmlElement, "object")
  if (!objects.length) {
    return { kind: "objgen", members: {}, passthrough: [] }
  }
  // Process configs use a single anonymous root object
  const rootObj = objects[0]
  const fieldByName = new Map(fields.map((f) => [f.name, f]))
  const members: Record<string, ConfigValue> = {}
  const passthrough: { name: string; content: string }[] = []
  const known = new Set(fields.map((f) => f.name))

  for (const m of directMembers(rootObj)) {
    const name = m.getAttribute("name")
    if (!name) continue
    if (!known.has(name)) {
      passthrough.push({ name, content: textContent(m) })
      continue
    }
    members[name] = parseMemberValue(m, fieldByName.get(name))
  }

  return { kind: "objgen", members, passthrough }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function isMap(v: ConfigValue): v is ConfigMap {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as ConfigMap).__kind === "map"
  )
}

function isObject(v: ConfigValue): v is ConfigObject {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as ConfigObject).__kind === "object"
  )
}

function serializeScalar(v: ConfigScalar): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "boolean") return v ? "true" : "false"
  return String(v)
}

type ConfigScalar = string | number | boolean | null

function serializeValue(v: ConfigValue, indent: string): string {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return escapeXml(serializeScalar(v))
  }
  if (Array.isArray(v)) {
    if (!v.length) return ""
    return (
      "\n" +
      v
        .map((item) => {
          if (
            item !== null &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            isObject(item)
          ) {
            return `${indent}  <element>\n${indent}    <object>\n${serializeMembers(item.members, indent + "      ")}${indent}    </object>\n${indent}  </element>`
          }
          return `${indent}  <element>${escapeXml(serializeScalar(item as ConfigScalar))}</element>`
        })
        .join("\n") +
      `\n${indent}`
    )
  }
  if (isMap(v)) {
    if (!v.entries.length) return ""
    return (
      "\n" +
      v.entries
        .map(
          (e) =>
            `${indent}  <pair>\n${indent}    <key>${escapeXml(e.key)}</key>\n${indent}    <value>${serializeValue(e.value, indent + "    ")}</value>\n${indent}  </pair>`
        )
        .join("\n") +
      `\n${indent}`
    )
  }
  if (isObject(v)) {
    return `\n${indent}  <object>\n${serializeMembers(v.members, indent + "    ")}${indent}  </object>\n${indent}`
  }
  return ""
}

function serializeMembers(
  members: Record<string, ConfigValue>,
  indent: string
): string {
  let out = ""
  for (const [name, value] of Object.entries(members)) {
    if (value === undefined) continue
    // Omit empty optional objects
    if (isObject(value) && Object.keys(value.members).length === 0) continue
    if (isMap(value) && value.entries.length === 0) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (value === null || value === "") continue

    const inner = serializeValue(value, indent)
    if (isObject(value) || isMap(value) || Array.isArray(value)) {
      out += `${indent}<member name="${escapeXml(name)}">${inner}</member>\n`
    } else {
      out += `${indent}<member name="${escapeXml(name)}">${inner}</member>\n`
    }
  }
  return out
}

/** Build objgen XML from edited members + passthrough. */
export function serializeObjgenConfig(doc: ObjgenDocument): string {
  let body = serializeMembers(doc.members, "        ")
  for (const p of doc.passthrough) {
    body += `        <member name="${escapeXml(p.name)}">${p.content}</member>\n`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<objgen>\n    <object>\n${body}    </object>\n</objgen>\n`
}

/** Normalize UI/JSON payloads into ConfigObject-shaped nested values. */
export function coerceObjgenMembers(
  raw: Record<string, unknown>,
  fields: FieldDef[]
): Record<string, ConfigValue> {
  const fieldByName = new Map(fields.map((f) => [f.name, f]))
  const out: Record<string, ConfigValue> = {}
  for (const [name, value] of Object.entries(raw)) {
    out[name] = coerceValue(value, fieldByName.get(name))
  }
  return out
}

function coerceValue(value: unknown, field?: FieldDef): ConfigValue {
  if (value === null || value === undefined) return null
  if (typeof value === "boolean" || typeof value === "number") return value
  if (typeof value === "string") {
    if (field?.kind === "bool") {
      if (value === "true") return true
      if (value === "false") return false
    }
    if (field?.kind === "number" && value !== "") {
      const n = Number(value)
      if (Number.isFinite(n)) return n
    }
    if (field?.kind === "list" || field?.kind === "array") {
      return value
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => coerceValue(s, field.element))
    }
    if (field?.kind === "map") {
      const entries = value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const eq = line.indexOf("=")
          if (eq < 0) return { key: line, value: "" as ConfigValue }
          return {
            key: line.slice(0, eq).trim(),
            value: coerceValue(line.slice(eq + 1).trim(), field.valueField),
          }
        })
      return { __kind: "map", entries }
    }
    return value
  }
  if (Array.isArray(value)) {
    // Could be list or map entries
    if (
      value.length &&
      typeof value[0] === "object" &&
      value[0] !== null &&
      "key" in (value[0] as object)
    ) {
      return {
        __kind: "map",
        entries: value.map((e) => {
          const row = e as { key?: unknown; value?: unknown }
          return {
            key: String(row.key ?? ""),
            value: coerceValue(row.value, field?.valueField),
          }
        }),
      }
    }
    return value.map((v) => coerceValue(v, field?.element))
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>
    if (o.__kind === "map" && Array.isArray(o.entries)) {
      return coerceValue(o.entries, field)
    }
    if (o.__kind === "object" && o.members && typeof o.members === "object") {
      return {
        __kind: "object",
        members: coerceObjgenMembers(
          o.members as Record<string, unknown>,
          field?.children ?? []
        ),
      }
    }
    // Plain object → nested object members
    if (field?.kind === "object" || field?.pointer || field?.children) {
      return {
        __kind: "object",
        members: coerceObjgenMembers(o, field.children ?? []),
      }
    }
  }
  return String(value)
}

export function unwrapObjectMembers(v: ConfigValue | undefined): Record<string, ConfigValue> {
  if (!v) return {}
  if (isObject(v)) return v.members
  if (typeof v === "object" && !Array.isArray(v) && !isMap(v)) {
    // Already plain record from JSON
    return v as unknown as Record<string, ConfigValue>
  }
  return {}
}

export function defaultValueForField(field: FieldDef): ConfigValue {
  if (field.kind === "object" || field.pointer) {
    if (field.pointer) return null
    const members: Record<string, ConfigValue> = {}
    for (const c of field.children ?? []) {
      if (c.default != null) members[c.name] = coerceValue(c.default, c)
    }
    return { __kind: "object", members }
  }
  if (field.kind === "list" || field.kind === "array") return []
  if (field.kind === "map") return { __kind: "map", entries: [] }
  if (field.default != null) return coerceValue(field.default, field)
  if (field.kind === "bool") return false
  if (field.kind === "number") return null
  return ""
}
