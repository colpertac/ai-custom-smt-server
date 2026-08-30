import { DOMParser, XMLSerializer } from "@xmldom/xmldom"

import type { ConfigValue, NewCharacterDocument } from "./types.ts"

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

/** Fields edited in the UI; everything else on Character is passthrough. */
export const NEWCHAR_EDIT_FIELDS = [
  "HomepointZone",
  "HomepointSpotID",
  "LearnedSkills",
] as const

function childrenOf(el: XmlElement, tag: string): XmlElement[] {
  const out: XmlElement[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 1 && n.tagName === tag) out.push(n as XmlElement)
  }
  return out
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

export function parseNewCharacterXml(xml: string): NewCharacterDocument {
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  const root = doc.documentElement
  if (!root || root.tagName !== "objgen") {
    throw new Error("Not a newcharacter.xml objgen document")
  }

  const character: Record<string, ConfigValue> = {}
  const characterPassthrough: { name: string; content: string }[] = []
  const otherObjectsXml: string[] = []
  const edit = new Set<string>(NEWCHAR_EDIT_FIELDS)

  for (const obj of childrenOf(root as XmlElement, "object")) {
    const name = obj.getAttribute("name")
    if (name !== "Character") {
      otherObjectsXml.push(serializer.serializeToString(obj as never))
      continue
    }
    for (const m of childrenOf(obj, "member")) {
      const mname = m.getAttribute("name")
      if (!mname) continue
      if (!edit.has(mname)) {
        characterPassthrough.push({ name: mname, content: textContent(m) })
        continue
      }
      if (mname === "LearnedSkills") {
        character[mname] = childrenOf(m, "element").map((e) => {
          const n = Number(textOf(e))
          return Number.isFinite(n) ? n : textOf(e)
        })
      } else {
        const t = textOf(m)
        const n = Number(t)
        character[mname] = Number.isFinite(n) ? n : t
      }
    }
  }

  return {
    kind: "newcharacter",
    character,
    characterPassthrough,
    otherObjectsXml,
  }
}

export function serializeNewCharacterXml(doc: NewCharacterDocument): string {
  let charBody = ""
  for (const name of NEWCHAR_EDIT_FIELDS) {
    const v = doc.character[name]
    if (v === undefined || v === null) continue
    if (name === "LearnedSkills" && Array.isArray(v)) {
      const elems = v
        .map((x) => `            <element>${escapeXml(String(x))}</element>`)
        .join("\n")
      charBody += `        <member name="LearnedSkills">\n${elems}\n        </member>\n`
    } else {
      charBody += `        <member name="${name}">${escapeXml(String(v))}</member>\n`
    }
  }
  for (const p of doc.characterPassthrough) {
    charBody += `        <member name="${escapeXml(p.name)}">${p.content}</member>\n`
  }

  const parts = [
    `    <object name="Character">\n${charBody}    </object>`,
    ...doc.otherObjectsXml.map((x) => `    ${x}`),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<objgen>\n${parts.join("\n")}\n</objgen>\n`
}
