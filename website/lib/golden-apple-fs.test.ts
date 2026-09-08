import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  parseNpc3401Apples,
  setPartialAppleAmountInXml,
} from "./golden-apple-parse.ts"
import {
  instanceIdsForDynamicMap,
  linkPayoutsToApplePartials,
} from "./golden-apple-types.ts"

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const NPC3401 = path.join(
  REPO,
  "deploy/data/datastore/zones/partial/npcs/NPC3401.xml"
)

describe("golden apple NPC3401", () => {
  it("parses Suginami bronze as 15 apples", () => {
    const xml = readFileSync(NPC3401, "utf8")
    const partials = parseNpc3401Apples(xml)
    const sug = partials.find((p) => p.partialId === 340104)
    assert.ok(sug)
    assert.equal(sug!.apples, 15)
    assert.deepEqual(sug!.dynamicMapIds, [5401004, 5402004, 5403004])
  })

  it("rewrites partial apple amount in place", () => {
    const xml = readFileSync(NPC3401, "utf8")
    const next = setPartialAppleAmountInXml(xml, 340104, 99)
    const sug = parseNpc3401Apples(next).find((p) => p.partialId === 340104)
    assert.equal(sug?.apples, 99)
    const untouched = parseNpc3401Apples(next).find(
      (p) => p.partialId === 340105
    )
    assert.equal(untouched?.apples, 210)
  })

  it("links suginami-bronze to partial 340104", () => {
    const xml = readFileSync(NPC3401, "utf8")
    const partials = parseNpc3401Apples(xml)
    const links = linkPayoutsToApplePartials(
      [
        {
          id: "suginami-bronze",
          instanceId: 5401,
          instanceIds: [5401, 5402, 5403],
        },
        { id: "suginami-silver", instanceId: 5421, instanceIds: [5421, 5422, 5423] },
      ],
      partials
    )
    const bronze = links.find((l) => l.payoutId === "suginami-bronze")
    assert.equal(bronze?.apples, 15)
    assert.equal(bronze?.partialId, 340104)
    const silver = links.find((l) => l.payoutId === "suginami-silver")
    assert.equal(silver?.apples, 210)
  })

  it("matches dynamic map to longest instance prefix", () => {
    const known = new Set([5401, 54010])
    assert.deepEqual(instanceIdsForDynamicMap(5401004, known), [54010, 5401])
  })
})
