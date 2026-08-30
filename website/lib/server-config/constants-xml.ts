import { DOMParser } from "@xmldom/xmldom"

import type { ConstantsDocument } from "./types.ts"

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

function textOf(el: XmlElement): string {
  let out = ""
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 3) out += n.nodeValue ?? ""
  }
  return out.trim()
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function parseConstantsXml(xml: string): ConstantsDocument {
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  const root = doc.documentElement
  if (!root || root.tagName !== "constants") {
    throw new Error("Not a constants.xml document")
  }
  const entries: { name: string; value: string }[] = []
  for (let i = 0; i < root.childNodes.length; i++) {
    const n = root.childNodes[i] as XmlNode
    if (n.nodeType !== 1 || n.tagName !== "constant") continue
    const el = n as XmlElement
    const name = el.getAttribute("name")
    if (!name) continue
    entries.push({ name, value: textOf(el) })
  }
  return { kind: "constants", entries }
}

export function serializeConstantsXml(doc: ConstantsDocument): string {
  const lines = doc.entries.map(
    (e) =>
      `    <constant name="${escapeXml(e.name)}">${escapeXml(e.value)}</constant>`
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<constants>\n${lines.join("\n")}\n</constants>\n`
}
