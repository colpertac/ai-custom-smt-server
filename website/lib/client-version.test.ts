import { describe, expect, it } from "vitest"

import {
  DEFAULT_CLIENT_VERSION_CODE,
  DEFAULT_COMP_CLIENT_XML,
  describeClientVersionMismatch,
  formatLobbyVersion,
  lobbyFloatToCode,
  parseCompClientVersion,
  setCompClientVersion,
  validateCompClientXml,
} from "@/lib/client-version"

describe("client version pairing", () => {
  it("maps lobby 1.666 to overlay 1666", () => {
    expect(lobbyFloatToCode(1.666)).toBe(1666)
    expect(lobbyFloatToCode("1.666")).toBe(1666)
    expect(formatLobbyVersion(1666)).toBe("1.666")
  })

  it("rounds nearby floats to the overlay integer", () => {
    expect(lobbyFloatToCode(1.667)).toBe(1667)
    expect(formatLobbyVersion(1667)).toBe("1.667")
    expect(lobbyFloatToCode(1.576)).toBe(1576)
  })

  it("parses and rewrites <version> in comp_client.xml", () => {
    expect(parseCompClientVersion(DEFAULT_COMP_CLIENT_XML)).toBe(
      DEFAULT_CLIENT_VERSION_CODE
    )
    const next = setCompClientVersion(DEFAULT_COMP_CLIENT_XML, 1667)
    expect(parseCompClientVersion(next)).toBe(1667)
    expect(next).toContain(`<patch name="updaterCheck">skip</patch>`)
  })

  it("inserts a version tag when the overlay file has none", () => {
    const xml = `<?xml version="1.0"?>\n<config>\n    <patch name="noWebAuth">apply</patch>\n</config>\n`
    const next = setCompClientVersion(xml, 1668)
    expect(parseCompClientVersion(next)).toBe(1668)
    expect(next).toContain(`<patch name="noWebAuth">apply</patch>`)
  })

  it("defaults missing lobby values to 1.666", () => {
    expect(lobbyFloatToCode(null)).toBe(1666)
    expect(lobbyFloatToCode(undefined)).toBe(1666)
    expect(lobbyFloatToCode("")).toBe(1666)
  })

  it("accepts a compressor-heavy paste without rewriting it", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
	<version>401</version>
	<patch name="noWebAuth">apply</patch>
	<patch name="customPackets">skip</patch>
	<patch name="accountDump">skip</patch>
	<patch name="updaterCheck">skip</patch>
	<patch name="packFile">skip</patch>
	<patch name="translation">apply</patch>
	<patch name="compressors">apply</patch>
	<compressors>
		<compressor>
			<!-- Macca Note -->
			<base-id>799</base-id>
			<compressor-id>699</compressor-id>
			<compressor-value>50000</compressor-value>
		</compressor>
	</compressors>
</config>
`
    expect(validateCompClientXml(xml)).toEqual({ versionCode: 401 })
    expect(formatLobbyVersion(401)).toBe("0.401")
    const bumped = setCompClientVersion(xml, 402)
    expect(parseCompClientVersion(bumped)).toBe(402)
    expect(bumped).toContain("compressors")
    expect(bumped).toContain("Macca Note")
    expect(bumped).toContain(`<patch name="translation">apply</patch>`)
  })

  it("rejects XML without a config root or version", () => {
    expect(() => validateCompClientXml("<foo/>")).toThrow(/Root element/)
    expect(() => validateCompClientXml("<config></config>")).toThrow(/version/)
  })

  it("flags overlay vs lobby mismatches and picks the higher code", () => {
    expect(
      describeClientVersionMismatch({
        lobbyCode: 1666,
        overlayCode: 1666,
        overlayExists: true,
      }).mismatched
    ).toBe(false)

    const differ = describeClientVersionMismatch({
      lobbyCode: 1666,
      overlayCode: 1670,
      overlayExists: true,
    })
    expect(differ).toMatchObject({
      mismatched: true,
      reason: "codes_differ",
      targetCode: 1670,
      targetVersion: "1.670",
    })

    const lowerOverlay = describeClientVersionMismatch({
      lobbyCode: 1668,
      overlayCode: 401,
      overlayExists: true,
    })
    expect(lowerOverlay.targetCode).toBe(1668)

    expect(
      describeClientVersionMismatch({
        lobbyCode: 1666,
        overlayCode: null,
        overlayExists: false,
      }).reason
    ).toBe("overlay_missing")

    expect(
      describeClientVersionMismatch({
        lobbyCode: 1666,
        overlayCode: null,
        overlayExists: true,
      }).reason
    ).toBe("overlay_no_version")
  })
})
