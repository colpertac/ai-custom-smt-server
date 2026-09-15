import { DOMParser, XMLSerializer } from "@xmldom/xmldom"

import {
  NULL_UUID,
  UUID_RE,
  type BackupCharacterSummary,
} from "@/lib/character-import/types"

const UUID_TEST =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function isUuidString(s: string): boolean {
  return UUID_TEST.test(s)
}

/** Minimal node shape — avoid clashing with DOM lib `Element`. */
type XmlNode = {
  nodeType: number
  nodeValue: string | null
  childNodes: ArrayLike<XmlNode>
  tagName?: string
  getAttribute?: (name: string) => string | null
  textContent?: string | null
}

export type XmlElement = XmlNode & {
  tagName: string
  getAttribute: (name: string) => string | null
  setAttribute?: (name: string, value: string) => void
  childNodes: ArrayLike<XmlNode>
  appendChild?: (child: XmlNode) => XmlNode
  removeChild?: (child: XmlNode) => XmlNode
  cloneNode?: (deep: boolean) => XmlNode
  ownerDocument?: {
    createElement: (name: string) => XmlElement
    createTextNode: (data: string) => XmlNode
    createCDATASection?: (data: string) => XmlNode
  }
}

export type BackupObject = {
  type: string
  uuid: string
  element: XmlElement
}

export type ParsedBackup = {
  doc: ReturnType<DOMParser["parseFromString"]>
  root: XmlElement
  objects: BackupObject[]
  byUuid: Map<string, BackupObject>
  characters: BackupCharacterSummary[]
  accountUuid: string | null
}

const serializer = new XMLSerializer()

export class BackupParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackupParseError"
  }
}

function isElement(n: XmlNode | null | undefined): n is XmlElement {
  return Boolean(n && n.nodeType === 1 && n.tagName)
}

export function childrenNamed(parent: XmlElement, tag: string): XmlElement[] {
  const out: XmlElement[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes[i]
    if (isElement(n) && n.tagName === tag) out.push(n)
  }
  return out
}

export function memberElements(objectEl: XmlElement): XmlElement[] {
  return childrenNamed(objectEl, "member")
}

export function memberByName(
  objectEl: XmlElement,
  name: string
): XmlElement | null {
  for (const m of memberElements(objectEl)) {
    if (m.getAttribute("name") === name) return m
  }
  return null
}

/** Scalar / CDATA text inside a member (ignores nested element markup text mix). */
export function memberText(objectEl: XmlElement, name: string): string | null {
  const m = memberByName(objectEl, name)
  if (!m) return null
  return scalarText(m)
}

export function scalarText(el: XmlElement): string {
  let out = ""
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 3 || n.nodeType === 4) {
      out += n.nodeValue ?? ""
    } else if (isElement(n) && (n.tagName === "element" || n.tagName === "value" || n.tagName === "key")) {
      // skip nested for scalar path
    }
  }
  return out.trim()
}

/** Collect UUID-looking strings from an element's full serialized text. */
export function collectUuidsFromElement(el: XmlElement): string[] {
  const xml = serializer.serializeToString(el as never)
  const found = xml.match(UUID_RE) ?? []
  return [...new Set(found.map((u) => u.toLowerCase()))]
}

export function setMemberText(
  objectEl: XmlElement,
  name: string,
  value: string,
  asCdata = false
): void {
  const m = memberByName(objectEl, name)
  if (!m) return
  while (m.childNodes.length) {
    m.removeChild?.(m.childNodes[0])
  }
  const doc = objectEl.ownerDocument
  if (!doc) return
  if (asCdata && doc.createCDATASection) {
    m.appendChild?.(doc.createCDATASection(value))
  } else {
    m.appendChild?.(doc.createTextNode(value))
  }
}

export function replaceUuidRefsInElement(
  el: XmlElement,
  remap: Map<string, string>
): void {
  const walk = (node: XmlNode) => {
    if (node.nodeType === 3 || node.nodeType === 4) {
      const raw = node.nodeValue ?? ""
      const next = raw.replace(UUID_RE, (match) => {
        const key = match.toLowerCase()
        if (key === NULL_UUID) return match
        return remap.get(key) ?? match
      })
      if (next !== raw) {
        ;(node as { nodeValue: string | null }).nodeValue = next
      }
      return
    }
    if (!isElement(node)) return
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i])
    }
  }
  walk(el)
}

export function serializeObjectsXml(objects: BackupObject[]): string {
  const parts = objects.map(
    (o) => serializer.serializeToString(o.element as never)
  )
  return `<objects>\n${parts.join("\n")}\n</objects>\n`
}

function parseLevel(
  byUuid: Map<string, BackupObject>,
  characterEl: XmlElement
): number {
  const statsUid = memberText(characterEl, "CoreStats")
  if (!statsUid || statsUid === NULL_UUID) return 0
  const stats = byUuid.get(statsUid.toLowerCase())
  if (!stats) return 0
  const level = memberText(stats.element, "Level")
  const n = level != null ? Number(level) : 0
  return Number.isFinite(n) ? n : 0
}

/**
 * Parse a Reimagine/Amala Backups account dump.
 * Rejects files that do not look like COMP PersistentObject XML.
 */
export function parseBackupXml(xml: string): ParsedBackup {
  const trimmed = xml.trim()
  if (!trimmed) {
    throw new BackupParseError("Empty file")
  }
  if (!trimmed.includes("<objects") || !trimmed.includes("<object")) {
    throw new BackupParseError(
      "Not a game Backups XML dump (missing <objects>/<object>)"
    )
  }

  const doc = new DOMParser().parseFromString(trimmed, "text/xml")
  const root = doc.documentElement
  if (!root || root.tagName !== "objects") {
    throw new BackupParseError(
      "Not a game Backups XML dump (root must be <objects>)"
    )
  }

  const objectEls = childrenNamed(root as unknown as XmlElement, "object")
  if (!objectEls.length) {
    throw new BackupParseError("Dump contains no objects")
  }

  const objects: BackupObject[] = []
  const byUuid = new Map<string, BackupObject>()
  let accountUuid: string | null = null
  let accountCount = 0
  let characterCount = 0

  for (const el of objectEls) {
    const type = el.getAttribute("name")?.trim()
    if (!type) {
      throw new BackupParseError("Object missing name attribute")
    }
    const uuidRaw = memberText(el, "UUID")
    if (!uuidRaw || !isUuidString(uuidRaw)) {
      throw new BackupParseError(`Object ${type} missing valid UUID`)
    }
    const uuid = uuidRaw.toLowerCase()
    const obj: BackupObject = { type, uuid, element: el }
    objects.push(obj)
    if (byUuid.has(uuid)) {
      throw new BackupParseError(`Duplicate UUID in dump: ${uuid}`)
    }
    byUuid.set(uuid, obj)
    if (type === "Account") {
      accountCount += 1
      accountUuid = uuid
    }
    if (type === "Character") characterCount += 1
  }

  if (accountCount < 1) {
    throw new BackupParseError("Dump must include an Account object")
  }
  if (characterCount < 1) {
    throw new BackupParseError("Dump must include at least one Character")
  }

  const characters: BackupCharacterSummary[] = []
  for (const obj of objects) {
    if (obj.type !== "Character") continue
    const name = memberText(obj.element, "Name")
    if (!name) {
      throw new BackupParseError(`Character ${obj.uuid} missing Name`)
    }
    characters.push({
      uuid: obj.uuid,
      name,
      level: parseLevel(byUuid, obj.element),
      gender: memberText(obj.element, "Gender") ?? "UNKNOWN",
    })
  }

  return {
    doc,
    root: root as unknown as XmlElement,
    objects,
    byUuid,
    characters,
    accountUuid,
  }
}
