import { DOMParser, XMLSerializer } from "@xmldom/xmldom"

import type { ConfigValue, SetupAccount, SetupDocument } from "./types.ts"

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

const ACCOUNT_FIELDS = [
  "UID",
  "Username",
  "DisplayName",
  "Email",
  "Password",
  "CP",
  "TicketCount",
  "UserLevel",
  "Enabled",
  "IsGM",
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

function memberIsComplex(el: XmlElement): boolean {
  for (let i = 0; i < el.childNodes.length; i++) {
    if (el.childNodes[i].nodeType === 1) return true
  }
  return false
}

function parseScalar(text: string, name: string): ConfigValue {
  const t = text.trim()
  if (name === "Enabled" || name === "IsGM") {
    if (t === "true" || t === "1") return true
    if (t === "false" || t === "0") return false
  }
  if (name === "CP" || name === "TicketCount" || name === "UserLevel") {
    const n = Number(t)
    if (Number.isFinite(n)) return n
  }
  return t
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function parseSetupXml(xml: string): SetupDocument {
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  const root = doc.documentElement
  if (!root || root.tagName !== "objgen") {
    throw new Error("Not a setup.xml objgen document")
  }
  const known = new Set<string>(ACCOUNT_FIELDS)
  const accounts: SetupAccount[] = []
  for (const obj of childrenOf(root as XmlElement, "object")) {
    if (obj.getAttribute("name") !== "Account") continue
    const members: Record<string, ConfigValue> = {}
    const passthrough: { name: string; content: string }[] = []
    for (const m of childrenOf(obj, "member")) {
      const name = m.getAttribute("name")
      if (!name) continue
      if (!known.has(name) || memberIsComplex(m)) {
        passthrough.push({ name, content: textContent(m) })
        continue
      }
      members[name] = parseScalar(textContent(m), name)
    }
    accounts.push({ members, passthrough })
  }
  return { kind: "setup", accounts }
}

export function serializeSetupXml(doc: SetupDocument): string {
  const blocks = doc.accounts.map((acct) => {
    let body = ""
    for (const name of ACCOUNT_FIELDS) {
      const v = acct.members[name]
      if (v === undefined || v === null || v === "") continue
      const text =
        typeof v === "boolean" ? (v ? "true" : "false") : String(v)
      body += `        <member name="${name}">${escapeXml(text)}</member>\n`
    }
    for (const p of acct.passthrough) {
      body += `        <member name="${escapeXml(p.name)}">${p.content}</member>\n`
    }
    return `    <object name="Account">\n${body}    </object>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<objgen>\n${blocks.join("\n")}\n</objgen>\n`
}

export { ACCOUNT_FIELDS }
