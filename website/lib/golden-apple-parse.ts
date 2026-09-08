import {
  GOLDEN_APPLE_AMOUNT_FLAG,
  type GoldenApplePartial,
} from "./golden-apple-types.ts"

const PARTIAL_RE =
  /<object name="ServerZonePartial">([\s\S]*?)<\/object>/g

export class GoldenAppleParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GoldenAppleParseError"
  }
}

export function parseNpc3401Apples(xml: string): GoldenApplePartial[] {
  const out: GoldenApplePartial[] = []
  for (const match of xml.matchAll(PARTIAL_RE)) {
    const body = match[1] ?? ""
    const idMatch = body.match(/<member name="ID">(\d+)<\/member>/)
    if (!idMatch) continue
    const mapsBlock = body.match(
      /<member name="DynamicMapIDs">([\s\S]*?)<\/member>/
    )
    const dynamicMapIds = mapsBlock
      ? [...mapsBlock[1]!.matchAll(/<element>(\d+)<\/element>/g)].map((m) =>
          Number(m[1])
        )
      : []
    const amountRe = new RegExp(
      `<key>${GOLDEN_APPLE_AMOUNT_FLAG}</key>\\s*<value>(\\d+)</value>`
    )
    const amountMatch = body.match(amountRe)
    if (!amountMatch || !dynamicMapIds.length) continue
    out.push({
      partialId: Number(idMatch[1]),
      dynamicMapIds,
      apples: Number(amountMatch[1]),
    })
  }
  return out
}

/** Replace flag 340102 value inside one ServerZonePartial block. */
export function setPartialAppleAmountInXml(
  xml: string,
  partialId: number,
  apples: number
): string {
  if (!Number.isInteger(apples) || apples < 0 || apples > 1_000_000) {
    throw new GoldenAppleParseError(`Invalid apple amount: ${apples}`)
  }
  let found = false
  const next = xml.replace(PARTIAL_RE, (full, body: string) => {
    const idMatch = body.match(/<member name="ID">(\d+)<\/member>/)
    if (!idMatch || Number(idMatch[1]) !== partialId) return full
    const amountRe = new RegExp(
      `(<key>${GOLDEN_APPLE_AMOUNT_FLAG}</key>\\s*<value>)\\d+(</value>)`
    )
    if (!amountRe.test(body)) {
      throw new GoldenAppleParseError(
        `Partial ${partialId} has no flag ${GOLDEN_APPLE_AMOUNT_FLAG}`
      )
    }
    found = true
    const newBody = body.replace(amountRe, `$1${apples}$2`)
    return `<object name="ServerZonePartial">${newBody}</object>`
  })
  if (!found) {
    throw new GoldenAppleParseError(`NPC3401 partial ${partialId} not found`)
  }
  return next
}
