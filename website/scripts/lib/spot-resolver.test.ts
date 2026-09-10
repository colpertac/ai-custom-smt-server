import { describe, expect, it } from "vitest"

import { extractRawNpcPlacements } from "./spot-resolver"

describe("extractRawNpcPlacements", () => {
  it("ignores commented SpotID and uses inline X/Y", () => {
    const xml = `<?xml version="1.0"?>
<object name="ServerZonePartial">
  <member name="DynamicMapIDs"><element>50101</element></member>
  <member name="NPCs">
    <element>
      <!-- 集計係のイノセント -->
      <object name="ServerNPC">
        <member name="ID">322</member>
        <member name="X">140</member>
        <member name="Y">-1359.07</member>
        <!-- Spot removed after event -->
        <!--<member name="SpotID">60039</member>-->
      </object>
    </element>
  </member>
</object>`

    const placements = extractRawNpcPlacements([xml])
    expect(placements).toHaveLength(1)
    expect(placements[0]).toMatchObject({
      nameJp: "集計係のイノセント",
      zoneId: 50101,
      spotId: 0,
      x: 140,
      y: -1359.07,
    })
  })

  it("keeps active SpotID placements", () => {
    const xml = `
<object name="ServerZonePartial">
  <member name="DynamicMapIDs"><element>20101</element></member>
  <member name="NPCs">
    <element>
      <!-- ジャックフロスト -->
      <object name="ServerNPC">
        <member name="SpotID">60020</member>
      </object>
    </element>
  </member>
</object>`

    const placements = extractRawNpcPlacements([xml])
    expect(placements).toEqual([
      {
        nameJp: "ジャックフロスト",
        zoneId: 20101,
        spotId: 60020,
        x: null,
        y: null,
      },
    ])
  })
})
