import fs from "node:fs"

import { describe, expect, it } from "vitest"

import {
  loadArmoryDemonDetail,
  loadArmoryDemons,
} from "@/lib/armory-demons"
import { getWorldDbPath } from "@/lib/world-db"

describe("loadArmoryDemons", () => {
  it("loads COMP demons for admin without exposing Account", () => {
    if (!fs.existsSync(getWorldDbPath())) return
    const payload = loadArmoryDemons("admin")
    expect(payload).not.toBeNull()
    expect(payload!.name).toBe("admin")
    expect(payload!.comp.length).toBeGreaterThan(0)
    expect(payload!.comp.some((d) => d.stats && d.stats.level > 0)).toBe(true)
    const json = JSON.stringify(payload)
    expect(json).not.toMatch(/00000000-0000-0000-0000-000000000a01/)
    expect(payload).not.toHaveProperty("account")
  })
})

describe("loadArmoryDemonDetail", () => {
  it("loads reunion + equipment fields for a COMP demon", () => {
    if (!fs.existsSync(getWorldDbPath())) return
    const list = loadArmoryDemons("admin")
    const first = list?.comp[0]
    if (!first) return
    const detail = loadArmoryDemonDetail(first.id)
    expect(detail).not.toBeNull()
    expect(detail!.id).toBe(first.id)
    expect(detail!.reunion).toHaveLength(12)
    expect(detail!.equipment).toHaveLength(4)
    expect(detail!.stats?.clsr).toBeDefined()
    expect(detail!.inheritedSkills).toBeDefined()
    expect(detail!.name).not.toMatch(/^Demon \d+$/)
    expect(detail!.ownerCharacter).toBe("admin")
    expect(detail!.location).toBe("comp")
    expect(JSON.stringify(detail)).not.toMatch(
      /00000000-0000-0000-0000-000000000a01/
    )
  })
})
