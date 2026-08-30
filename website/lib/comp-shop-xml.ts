import { DOMParser, XMLSerializer } from "@xmldom/xmldom"

/** Minimal node shape — avoid clashing with DOM lib `Element`. */
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
  childNodes: ArrayLike<XmlNode>
}

/** Known shop-level fields edited in the UI (others pass through). */
const SHOP_KNOWN = new Set([
  "ShopID",
  "Name",
  "Type",
  "Tabs",
])

const TAB_KNOWN = new Set(["Name", "Products"])

const PRODUCT_KNOWN = new Set([
  "ProductID",
  "MerchantDescription",
  "BasePrice",
  "MoonRestrict",
])

export type ShopPassthroughMember = {
  name: string
  /** Inner XML / text content of the member (not including the member wrapper). */
  content: string
  /** True when the member contains child elements (lists, nested objects). */
  complex: boolean
}

export type CompShopProduct = {
  productId: number
  basePrice: number
  merchantDescription?: string
  moonRestrict?: string
  passthrough: ShopPassthroughMember[]
}

export type CompShopTab = {
  name: string
  products: CompShopProduct[]
  passthrough: ShopPassthroughMember[]
}

export type CompShop = {
  shopId: number
  name: string
  type: string
  tabs: CompShopTab[]
  passthrough: ShopPassthroughMember[]
  filename: string
}

const serializer = new XMLSerializer()

function textContent(el: XmlElement): string {
  let out = ""
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 3 /* TEXT_NODE */) {
      out += n.nodeValue ?? ""
    } else if (n.nodeType === 1) {
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
  const out: XmlElement[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes[i]
    if (n.nodeType === 1 && n.tagName === "member") {
      out.push(n as XmlElement)
    }
  }
  return out
}

function firstObject(parent: XmlElement, objectName: string): XmlElement | null {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes[i]
    if (n.nodeType !== 1) continue
    const el = n as XmlElement
    if (el.tagName === "object" && el.getAttribute("name") === objectName) {
      return el
    }
  }
  return null
}

function childElements(parent: XmlElement, tag: string): XmlElement[] {
  const out: XmlElement[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes[i]
    if (n.nodeType === 1 && n.tagName === tag) {
      out.push(n as XmlElement)
    }
  }
  return out
}

function parsePassthrough(
  members: XmlElement[],
  known: Set<string>
): ShopPassthroughMember[] {
  const out: ShopPassthroughMember[] = []
  for (const m of members) {
    const name = m.getAttribute("name") || ""
    if (!name || known.has(name)) continue
    out.push({
      name,
      content: textContent(m),
      complex: memberIsComplex(m),
    })
  }
  return out
}

function parseProduct(obj: XmlElement): CompShopProduct {
  const members = directMembers(obj)
  let productId = 0
  let basePrice = 0
  let merchantDescription: string | undefined
  let moonRestrict: string | undefined

  for (const m of members) {
    const name = m.getAttribute("name")
    const raw = textContent(m).trim()
    if (name === "ProductID") productId = Number.parseInt(raw, 10) || 0
    else if (name === "BasePrice") basePrice = Number.parseInt(raw, 10) || 0
    else if (name === "MerchantDescription") merchantDescription = raw
    else if (name === "MoonRestrict") moonRestrict = raw
  }

  return {
    productId,
    basePrice,
    merchantDescription,
    moonRestrict,
    passthrough: parsePassthrough(members, PRODUCT_KNOWN),
  }
}

function parseTab(obj: XmlElement): CompShopTab {
  const members = directMembers(obj)
  let name = ""
  const products: CompShopProduct[] = []

  for (const m of members) {
    const mName = m.getAttribute("name")
    if (mName === "Name") {
      name = textContent(m).trim()
    } else if (mName === "Products") {
      for (const el of childElements(m, "element")) {
        const prodObj = firstObject(el, "ServerShopProduct")
        if (prodObj) products.push(parseProduct(prodObj))
      }
    }
  }

  return {
    name,
    products,
    passthrough: parsePassthrough(members, TAB_KNOWN),
  }
}

export function parseCompShopXml(
  xml: string,
  filename = "compshop.xml"
): CompShop {
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  const objectsRoot = doc.getElementsByTagName("objects")[0] as
    | XmlElement
    | undefined
  if (!objectsRoot) {
    throw new Error("Invalid shop XML: missing <objects>")
  }
  const shopObj = firstObject(objectsRoot, "ServerShop")
  if (!shopObj) {
    throw new Error("Invalid shop XML: missing ServerShop")
  }

  const members = directMembers(shopObj)
  let shopId = 0
  let name = ""
  let type = "COMP_SHOP"
  const tabs: CompShopTab[] = []

  for (const m of members) {
    const mName = m.getAttribute("name")
    const raw = textContent(m).trim()
    if (mName === "ShopID") shopId = Number.parseInt(raw, 10) || 0
    else if (mName === "Name") name = raw
    else if (mName === "Type") type = raw || type
    else if (mName === "Tabs") {
      for (const el of childElements(m, "element")) {
        const tabObj = firstObject(el, "ServerShopTab")
        if (tabObj) tabs.push(parseTab(tabObj))
      }
    }
  }

  return {
    shopId,
    name,
    type,
    tabs,
    passthrough: parsePassthrough(members, SHOP_KNOWN),
    filename,
  }
}

function escapeXmlText(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function indent(level: number): string {
  return "    ".repeat(level)
}

function writePassthrough(
  lines: string[],
  level: number,
  items: ShopPassthroughMember[]
) {
  for (const p of items) {
    if (p.complex) {
      lines.push(`${indent(level)}<member name="${p.name}">`)
      const trimmed = p.content.replace(/^\n/, "").replace(/\n$/, "")
      for (const rawLine of trimmed.split("\n")) {
        const line = rawLine.trimEnd()
        if (!line.trim()) {
          lines.push("")
          continue
        }
        lines.push(`${indent(level + 1)}${line.trimStart()}`)
      }
      lines.push(`${indent(level)}</member>`)
    } else {
      lines.push(
        `${indent(level)}<member name="${p.name}">${escapeXmlText(p.content.trim())}</member>`
      )
    }
  }
}

function writeProduct(lines: string[], level: number, product: CompShopProduct) {
  lines.push(`${indent(level)}<element>`)
  lines.push(`${indent(level + 1)}<object name="ServerShopProduct">`)
  lines.push(
    `${indent(level + 2)}<member name="ProductID">${product.productId}</member>`
  )
  if (
    product.merchantDescription !== undefined &&
    product.merchantDescription !== ""
  ) {
    lines.push(
      `${indent(level + 2)}<member name="MerchantDescription">${escapeXmlText(product.merchantDescription)}</member>`
    )
  }
  lines.push(
    `${indent(level + 2)}<member name="BasePrice">${product.basePrice}</member>`
  )
  if (product.moonRestrict !== undefined && product.moonRestrict !== "") {
    lines.push(
      `${indent(level + 2)}<member name="MoonRestrict">${escapeXmlText(product.moonRestrict)}</member>`
    )
  }
  writePassthrough(lines, level + 2, product.passthrough)
  lines.push(`${indent(level + 1)}</object>`)
  lines.push(`${indent(level)}</element>`)
}

function writeTab(lines: string[], level: number, tab: CompShopTab) {
  lines.push(`${indent(level)}<element>`)
  lines.push(`${indent(level + 1)}<object name="ServerShopTab">`)
  lines.push(
    `${indent(level + 2)}<member name="Name">${escapeXmlText(tab.name)}</member>`
  )
  lines.push(`${indent(level + 2)}<member name="Products">`)
  for (const p of tab.products) {
    writeProduct(lines, level + 3, p)
  }
  lines.push(`${indent(level + 2)}</member>`)
  writePassthrough(lines, level + 2, tab.passthrough)
  lines.push(`${indent(level + 1)}</object>`)
  lines.push(`${indent(level)}</element>`)
}

export function serializeCompShop(shop: CompShop): string {
  const lines: string[] = []
  lines.push("<objects>")
  lines.push(`${indent(1)}<object name="ServerShop">`)
  lines.push(
    `${indent(2)}<member name="ShopID">${shop.shopId}</member>`
  )
  lines.push(
    `${indent(2)}<member name="Name">${escapeXmlText(shop.name)}</member>`
  )
  lines.push(
    `${indent(2)}<member name="Type">${escapeXmlText(shop.type)}</member>`
  )
  lines.push(`${indent(2)}<member name="Tabs">`)
  for (const tab of shop.tabs) {
    writeTab(lines, 3, tab)
  }
  lines.push(`${indent(2)}</member>`)
  writePassthrough(lines, 2, shop.passthrough)
  lines.push(`${indent(1)}</object>`)
  lines.push("</objects>")
  return `${lines.join("\n")}\n`
}

/** Semantic equality for round-trip tests (ignores whitespace / member order of known fields). */
export function shopsEqual(a: CompShop, b: CompShop): boolean {
  if (
    a.shopId !== b.shopId ||
    a.name !== b.name ||
    a.type !== b.type ||
    a.tabs.length !== b.tabs.length
  ) {
    return false
  }
  if (!passthroughEqual(a.passthrough, b.passthrough)) return false
  for (let i = 0; i < a.tabs.length; i++) {
    const ta = a.tabs[i]
    const tb = b.tabs[i]
    if (ta.name !== tb.name || ta.products.length !== tb.products.length) {
      return false
    }
    if (!passthroughEqual(ta.passthrough, tb.passthrough)) return false
    for (let j = 0; j < ta.products.length; j++) {
      const pa = ta.products[j]
      const pb = tb.products[j]
      if (
        pa.productId !== pb.productId ||
        pa.basePrice !== pb.basePrice ||
        (pa.merchantDescription ?? "") !== (pb.merchantDescription ?? "") ||
        (pa.moonRestrict ?? "") !== (pb.moonRestrict ?? "")
      ) {
        return false
      }
      if (!passthroughEqual(pa.passthrough, pb.passthrough)) return false
    }
  }
  return true
}

function passthroughEqual(
  a: ShopPassthroughMember[],
  b: ShopPassthroughMember[]
): boolean {
  if (a.length !== b.length) return false
  const norm = (s: string) => s.replace(/\s+/g, " ").trim()
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false
    if (norm(a[i].content) !== norm(b[i].content)) return false
  }
  return true
}
