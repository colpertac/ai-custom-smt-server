import { describe, expect, it } from "vitest"

import {
  previewStripForCharacters,
  sliceCharacterGraphs,
} from "@/lib/character-import/character-graph"
import {
  BackupParseError,
  parseBackupXml,
} from "@/lib/character-import/parse-backup-xml"
import { buildSanitizedImportXml } from "@/lib/character-import/sanitize"
import {
  appendCharactersBlob,
  countOccupiedSlots,
  listCharacterUuidsFromBlob,
} from "@/lib/character-import/slots"
import { NULL_UUID } from "@/lib/character-import/types"

const FIXTURE = `<?xml version="1.0"?>
<objects>
    <object name="Account">
        <member name="UUID">aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</member>
        <member name="Username"><![CDATA[bakuser]]></member>
        <member name="DisplayName"><![CDATA[bakuser]]></member>
        <member name="Email"><![CDATA[bak@test.invalid]]></member>
        <member name="Password"><![CDATA[deadbeef]]></member>
        <member name="Salt"><![CDATA[abc12]]></member>
        <member name="CP">99999</member>
        <member name="TicketCount">5</member>
        <member name="UserLevel">1000</member>
        <member name="Enabled">true</member>
        <member name="APIOnly">false</member>
        <member name="Characters">
            <element>bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</element>
            <element>cccccccc-cccc-cccc-cccc-cccccccccccc</element>
            <element>${NULL_UUID}</element>
        </member>
    </object>
    <object name="Character">
        <member name="UUID">bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</member>
        <member name="Name"><![CDATA[HeroOne]]></member>
        <member name="Account">aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</member>
        <member name="Gender">MALE</member>
        <member name="COMP">dddddddd-dddd-dddd-dddd-dddddddddddd</member>
        <member name="CoreStats">eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee</member>
        <member name="ItemBoxes">
            <element>ffffffff-ffff-ffff-ffff-ffffffffffff</element>
            <element>${NULL_UUID}</element>
        </member>
        <member name="EquippedItems">
            <element>11111111-1111-1111-1111-111111111111</element>
            <element>${NULL_UUID}</element>
        </member>
    </object>
    <object name="Character">
        <member name="UUID">cccccccc-cccc-cccc-cccc-cccccccccccc</member>
        <member name="Name"><![CDATA[HeroTwo]]></member>
        <member name="Account">aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</member>
        <member name="Gender">FEMALE</member>
        <member name="CoreStats">22222222-2222-2222-2222-222222222222</member>
    </object>
    <object name="EntityStats">
        <member name="UUID">eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee</member>
        <member name="Level">42</member>
    </object>
    <object name="EntityStats">
        <member name="UUID">22222222-2222-2222-2222-222222222222</member>
        <member name="Level">10</member>
    </object>
    <object name="ItemBox">
        <member name="UUID">ffffffff-ffff-ffff-ffff-ffffffffffff</member>
        <member name="BoxID">0</member>
        <member name="Type">INVENTORY</member>
        <member name="Account">aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</member>
        <member name="Character">bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</member>
        <member name="Items">
            <element>11111111-1111-1111-1111-111111111111</element>
            <element>33333333-3333-3333-3333-333333333333</element>
            <element>${NULL_UUID}</element>
        </member>
    </object>
    <object name="ItemBox">
        <member name="UUID">44444444-4444-4444-4444-444444444444</member>
        <member name="BoxID">0</member>
        <member name="Type">ITEM_DEPO</member>
        <member name="Account">aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</member>
        <member name="Character">${NULL_UUID}</member>
        <member name="Items">
            <element>${NULL_UUID}</element>
        </member>
    </object>
    <object name="Item">
        <member name="UUID">11111111-1111-1111-1111-111111111111</member>
        <member name="Type">1</member>
        <member name="ItemBox">ffffffff-ffff-ffff-ffff-ffffffffffff</member>
        <member name="BoxSlot">0</member>
        <member name="StackSize">1</member>
    </object>
    <object name="Item">
        <member name="UUID">33333333-3333-3333-3333-333333333333</member>
        <member name="Type">99999901</member>
        <member name="ItemBox">ffffffff-ffff-ffff-ffff-ffffffffffff</member>
        <member name="BoxSlot">1</member>
        <member name="StackSize">1</member>
    </object>
    <object name="DemonBox">
        <member name="UUID">dddddddd-dddd-dddd-dddd-dddddddddddd</member>
        <member name="BoxID">0</member>
        <member name="Account">aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</member>
        <member name="Character">bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</member>
        <member name="Demons">
            <element>55555555-5555-5555-5555-555555555555</element>
            <element>${NULL_UUID}</element>
        </member>
    </object>
    <object name="Demon">
        <member name="UUID">55555555-5555-5555-5555-555555555555</member>
        <member name="Type">167</member>
        <member name="DemonBox">dddddddd-dddd-dddd-dddd-dddddddddddd</member>
        <member name="BoxSlot">0</member>
        <member name="CoreStats">${NULL_UUID}</member>
    </object>
</objects>
`

describe("parseBackupXml", () => {
  it("parses characters and levels from a Backups-shaped dump", () => {
    const parsed = parseBackupXml(FIXTURE)
    expect(parsed.characters).toHaveLength(2)
    expect(parsed.characters[0]?.name).toBe("HeroOne")
    expect(parsed.characters[0]?.level).toBe(42)
    expect(parsed.characters[1]?.name).toBe("HeroTwo")
    expect(parsed.accountUuid).toBeTruthy()
  })

  it("rejects non-backup XML", () => {
    expect(() => parseBackupXml("<root><foo/></root>")).toThrow(BackupParseError)
  })

  it("rejects dumps without Character", () => {
    expect(() =>
      parseBackupXml(`<objects>
          <object name="Account">
            <member name="UUID">aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</member>
            <member name="Username"><![CDATA[x]]></member>
          </object>
        </objects>`)
    ).toThrow(/at least one Character/i)
  })
})

describe("sliceCharacterGraphs", () => {
  it("includes char inventory and excludes ITEM_DEPO", () => {
    const parsed = parseBackupXml(FIXTURE)
    const hero = parsed.characters.find((c) => c.name === "HeroOne")!
    const { objects, skippedAccountDepotBoxes } = sliceCharacterGraphs(parsed, [
      hero.uuid,
    ])
    const types = objects.map((o) => o.type)
    expect(types).toContain("Item")
    expect(types).toContain("Demon")
    expect(types).toContain("ItemBox")
    expect(
      objects.some(
        (o) =>
          o.type === "ItemBox" &&
          o.uuid === "44444444-4444-4444-4444-444444444444"
      )
    ).toBe(false)
    expect(skippedAccountDepotBoxes).toBeGreaterThanOrEqual(1)
    expect(
      objects.some((o) => o.type === "Character" && o.uuid === hero.uuid)
    ).toBe(true)
    expect(
      objects.some((o) => o.type === "Character" && o.uuid !== hero.uuid)
    ).toBe(false)
  })
})

describe("previewStripForCharacters", () => {
  it("flags unknown item types", () => {
    const parsed = parseBackupXml(FIXTURE)
    const hero = parsed.characters.find((c) => c.name === "HeroOne")!
    const strip = previewStripForCharacters(
      parsed,
      [hero.uuid],
      (type) => type === 1,
      (type) => type === 167
    )
    expect(strip.unknownItems).toHaveLength(1)
    expect(strip.unknownItems[0]?.type).toBe(99999901)
    expect(strip.unknownDemons).toHaveLength(0)
  })
})

describe("buildSanitizedImportXml", () => {
  it("remaps UUIDs, renames, strips unknown items, ignores dump GM", () => {
    const parsed = parseBackupXml(FIXTURE)
    const result = buildSanitizedImportXml(parsed, {
      selections: [{ sourceName: "HeroOne", newName: "ImportedHero" }],
      registrationUserLevel: 0,
      isKnownItem: (type) => type === 1,
      isKnownDemon: (type) => type === 167,
    })
    expect(result.xml).toMatch(/<object name="Account">/)
    expect(result.xml).toMatch(/ImportedHero/)
    expect(result.xml).not.toMatch(/UserLevel">1000/)
    expect(result.xml).not.toMatch(/99999901/)
    expect(result.strippedItems).toBe(1)
    expect(result.imported[0]?.newName).toBe("ImportedHero")
    expect(result.imported[0]?.uuid).not.toBe(
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    )
    expect(result.ephemeralUsername.startsWith("imp_")).toBe(true)
  })
})

describe("character slots blob", () => {
  it("counts and appends into free slots", () => {
    const empty = Buffer.alloc(320)
    expect(countOccupiedSlots(empty)).toBe(0)
    const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    const one = appendCharactersBlob(empty, [a])
    expect(countOccupiedSlots(one)).toBe(1)
    expect(listCharacterUuidsFromBlob(one)).toEqual([a])
    const two = appendCharactersBlob(one, [b])
    expect(countOccupiedSlots(two)).toBe(2)
    expect(listCharacterUuidsFromBlob(two)).toEqual([a, b])
  })
})
